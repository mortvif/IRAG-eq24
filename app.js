// =============================================================================
// Modules
// =============================================================================
const http = require('http');
const express = require('express');
const websocket = require('ws');
const ffmpeg = require('fluent-ffmpeg');
const fs = require("fs");
const cors = require("cors");
const Promise = require("bluebird");
const exec = require("child_process").exec;

// =============================================================================
// Constants
// =============================================================================
const PORT = 8080;

// =============================================================================
// Servers initialization
// =============================================================================
const app = express();

const httpServer = http.createServer(app);

const wss = new websocket.Server({
    server: httpServer
});

httpServer.listen(PORT, function listening() {
    console.log('HTTP server listening on ' + PORT);
});

// =============================================================================
// Express Logic
// =============================================================================
app.use(cors())
app.use(express.static('public'));
app.use("/videos", express.static('videos'));
app.get("/available-videos", (req, res, next) => {
    console.log("GET - /available-videos")
    fs.readdir(__dirname + "/videos", (err, files) => {
        var videos = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.split('.').pop() === "mpd") {
                videos.push(file.split(".")[0])
            }
        }

        res.json(videos)
    })
})
// =============================================================================
// WS Logic
// =============================================================================
wss.on("connection", (ws) => {
    console.log("WS-New connections")

    var name = "video";
    var isFirstmsg = true;
    var metadata = {};
    ws.on('message', (data) => {

        if (isFirstmsg) {
            console.log("WS-Received metadata");
            isFirstmsg = false;
            received_metadata = JSON.parse(data);
            metadata.name = received_metadata.name;
            metadata.bitrates = received_metadata.bitrates.split(",");
            metadata.resolutions = received_metadata.resolutions.split(",");
            metadata.method = received_metadata.method;
            console.log(metadata);
        } else {
            console.log("WS-Receiving file");
            fs.writeFile(__dirname + "/tmp/" + metadata.name + ".mp4", data, (err) => {
                if (err == undefined) {

                    if (metadata.method == "ffmpeg") {
                        var options = [
                            "-i " + __dirname + "/tmp/" + metadata.name + ".mp4",
                            "-map 0:1",
                            "-c:a aac",
                            "-ar:a:1 22050",
                            "-c:v libx264",
                            "-preset ultrafast",
                            "-keyint_min 120",
                            "-g 120",
                            "-use_template 0",
                            "-media_seg_name '" + metadata.name + "_segment-$RepresentationID$-$Number%05d$.m4s'",
                            "-init_seg_name '" + metadata.name + "_initsegment-$RepresentationID$.m4s'",
                            "-adaptation_sets \"id=0,streams=v id=1,streams=a\""
                        ]

                        var n_representations = metadata.bitrates.length;
                        var bitratres = metadata.bitrates; //["300k", "500k", "1000k", "1500k", "3000k"];
                        var resolutions = metadata.resolutions; //["170x320", "640x480", "720x920", "1080x1920", "1080x1920"];

                        for (let i = 0; i < n_representations; i++) {
                            options.push("-map 0:0");
                            options.push("-b:v:" + i + " " + bitratres[i]);
                            options.push("-s:v:" + i + " " + resolutions[i]);
                        }

                        options.push("-f dash")
                        options.push(__dirname + "/videos/" + metadata.name + ".mpd")

                        var cmd = "ffmpeg ";
                        options.forEach((option) => {
                            cmd += (option + " ")
                        })

                        var ffmpeg_cmd = exec(cmd, (err, stdout, sdterr) => {
                            if (err == undefined) {
                                ws.send("Video ready");
                            } else {
                                ws.send("Video transcoding failed\n" + stdout)
                            }
                            console.log(err)
                            console.log(stdout)
                            console.log(sdterr)
                            console.log("FFMPEG finished");
                        })

                    } else if (metadata.method === "mp4box") {
                        var n_representations = metadata.bitrates.length;
                        var bitrates = metadata.bitrates; //["300k", "500k", "1000k", "1500k", "3000k"];
                        var resolutions = metadata.resolutions; //["170x320", "640x480", "720x920", "1080x1920", "1080x1920"];

                        Promise.map(bitrates,
                                (item, i) => {
                                    return encodeVideo(metadata.name, "video", resolutions[i], bitrates[i])
                                }, {
                                    concurrency: 1
                                })
                            .then((done) => {
                                console.log("Encoding video finished")
                                return encodeVideo(metadata.name, "audio")
                            })
                            .then((done) => {
                                console.log("Encoding audio finished");
                                return mp4box(metadata.name, bitrates, resolutions)
                            })
                            .then((result) => {
                                ws.send("Video ready");
                            })
                            .catch((error) => {
                                ws.send("Video transcoding failed!");
                                console.log(error)
                            })
                    }
                }
            })
        }
    })
})

function encodeVideo(name, type, resolution, bitrate) {
    return new Promise((resolve, reject) => {
        var ffmpegcmd = ffmpeg().input(__dirname + "/tmp/" + name + ".mp4")
        if (type === "audio") {
            ffmpegcmd.outputOptions([
                    "-c:a aac",
                    "-b:a 192k",
                    "-vn"
                ])
                .output(__dirname + "/videos/" + name + ".m4a")
        }

        if (type === "video") {
            ffmpegcmd.outputOptions([
                    "-an",
                    "-vcodec libx264",
                    "-b:v " + bitrate,
                    "-s:v " + resolution,
                    "-x264opts keyint=200:min-keyint=200:no-scenecut",
                ])
                .outputFormat("mp4")
                .output(__dirname + "/videos/" + name + "-" + bitrate + "-" + resolution + ".mp4")
        }
        ffmpegcmd.on('start', (command) => {
                console.log(command)
            })
            // .on('progress', (data) => console.log(data))
            .on('error', (err, stdout, stderr) => {
                console.log(err)
                console.log(stdout)
                console.log(stderr)
                reject()
            })
            .on("end", () => {
                resolve();
            })

        ffmpegcmd.run();

    })
}

function mp4box(name, bitrates, resolutions) {
    return new Promise((resolve, reject) => {

        var cmd = "MP4Box -dash-strict 2000 -rap -profile onDemand "
        cmd += (__dirname + "/videos/" + name + ".m4a ")

        for (let j = 0; j < bitrates.length; j++) {
            cmd += (__dirname + "/videos/" + name + "-" + bitrates[j] + "-" + resolutions[j] + ".mp4 ")
        }

        cmd += "-out "
        cmd += (__dirname + "/videos/" + name + ".mpd")

        var mp4cmd = exec(cmd, (err, stdout, sdterr) => {
            console.log(cmd)
            if (err == undefined) {
                resolve()
            } else {
                reject()
            }
            console.log(err)
            console.log(stdout)
            console.log(sdterr)
            console.log("MP4BOX finished");
        })
    })
}
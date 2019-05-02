// =============================================================================
// Modules
// =============================================================================
const http = require('http');
const express = require('express');
const websocket = require('ws');
const ffmpeg = require('fluent-ffmpeg');
const fs = require("fs");
const cors = require("cors");
const xml = require("xml-js");
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
            if(file.split('.').pop() === "mpd"){
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

        if(isFirstmsg){
            console.log("WS-Received metadata");
            isFirstmsg = false;
            received_metadata = JSON.parse(data);
            metadata.name = received_metadata.name;
            metadata.bitrates = received_metadata.bitrates.split(",");
            metadata.resolutions = received_metadata.resolutions.split(",");
            console.log(metadata);
        } else {
            console.log("WS-Receiving file");
            fs.writeFile(__dirname + "/tmp/" + metadata.name + ".mp4", data, (err) => {
                if (err == undefined) {
    
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
                    options.forEach((option) => {cmd += (option +" ")})
                    
                    var ffmpeg_cmd = exec(cmd, (err,stdout, sdterr) => {
                        if(err == undefined){
                            ws.send("Video ready");
                        } else {
                            ws.send("Video transcoding failed\n"+stdout)
                        }
                        console.log(err)
                        console.log(stdout)
                        console.log(sdterr)
                        console.log("FFMPEG finished");
                    })
                
    
                }
            })
        }
    })
})


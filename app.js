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
    console.log('listening on ' + PORT);
});

// =============================================================================
// Express Logic
// =============================================================================
app.use(cors())
app.use(express.static('public'));
app.use("/videos", express.static('videos'));

// =============================================================================
// WS Logic
// =============================================================================
wss.on("connection", (ws) => {
    console.log("connection")

    var name = "video";

    ws.on('message', (data) => {
        console.log("Receiving file");
        fs.writeFile(__dirname + "/tmp/" + name + ".mp4", data, (err) => {
            if (err == undefined) {

                var options = [
                    "-i " + __dirname + "/tmp/" + name + ".mp4",
                    "-map 0:1",
                    "-c:a libmp3lame",
                    "-ar:a:1 22050",
                    "-c:v libx264",
                    "-preset ultrafast",
                    "-keyint_min 120",
                    "-g 120",
                    "-use_template 0",
                    "-media_seg_name '" + name + "_segment-$RepresentationID$-$Number%05d$.m4s'",
                    "-init_seg_name '" + name + "_initsegment-$RepresentationID$.m4s'",
                    "-adaptation_sets \"id=0,streams=v id=1,streams=a\""
                ]

                var n_representations = 5;
                var bitratres = ["300k", "500k", "1000k", "1500k", "3000k"];
                var resolutions = ["170x320", "640x480", "720x920", "1080x1920", "1080x1920"];

                for (let i = 0; i < n_representations; i++) {
                    options.push("-map 0:0");
                    options.push("-b:v:" + i + " " + bitratres[i]);
                    options.push("-s:v:" + i + " " + resolutions[i]);
                }

                options.push("-f dash")
                options.push(__dirname + "/videos/" + name + ".mpd")

                var cmd = "ffmpeg ";
                options.forEach((option) => {cmd += (option +" ")})
                
                var ffmpeg_cmd = exec(cmd, (err,stdout, sdterr) => {
                    console.log(err)
                    console.log(stdout)
                    console.log(sdterr)
                })
            

            }
        })
    })
})

"id=0,streams=v id=1,streams=a"
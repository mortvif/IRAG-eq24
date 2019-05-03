var ws;
var player; 
var interval;
function connectWS() {
    ws = new WebSocket("ws://localhost:8080");
    ws.binaryType = "arraybuffer";

    ws.onopen = function() {
        alert("Connected.");
        sendMetadata();
        sendFile();
    };

    ws.onmessage = function(evt) {
        alert(evt.data);
    };

    ws.onclose = function() {
        alert("Connection is closed...");
    };

    ws.onerror = function(e) {
        alert(e.msg);
    }

}

function sendFile() {
    var file = document.getElementById('filename').files[0];

    var reader = new FileReader();

    var rawData = new ArrayBuffer();            

    reader.loadend = function() {
        alert("File loading ended!")
    }

    reader.onload = function(e) {
        rawData = e.target.result;
        ws.send(rawData);
        alert("the File has been transferred.");
    }

    reader.readAsArrayBuffer(file);
}

function sendMetadata(){
    var metadata = {};
    metadata.resolutions = document.getElementById("resolutions").value;
    metadata.bitrates = document.getElementById("bitrates").value;
    metadata.name = document.getElementById("name").value;
    metadata.method = document.getElementById("selected_method").value;
    ws.send(JSON.stringify(metadata));
}

function getAvailable(){
    var req = new Request(window.location.origin+"/available-videos");
    fetch(req)
    .then((response) => {
        return response.json();
    })
    .then((json) => {
        console.log(json)
        var select = document.getElementById("selected_video");
        select.innerHTML = "";
        json.forEach(video => {
            select.innerHTML+="<option value='"+video+"'>"+video+"</option>"
        });
    })
}

function playVideo(){
    if (interval != undefined) clearInterval(interval);
    var selected_video = document.getElementById("selected_video").value;
    var video = "<video id='video-player' width='720' controls></video>"
    document.getElementById("video-element").innerHTML=video;
    document.getElementById("video-element").innerHTML+="<p id='play-info'></p>"
    var url = window.location.origin+"/videos/"+selected_video+".mpd";
    player = dashjs.MediaPlayer().create();
    player.initialize(document.querySelector("#video-player"), url, true);
    interval = setInterval(() => {
        var info = JSON.stringify(player.getBitrateInfoListFor("video"));
        document.getElementById("play-info").innerHTML = info;
        console.log(info)
    }, 500)

}

var ws;

function connectWS() {
    ws = new WebSocket("ws://localhost:8080");
    ws.binaryType = "arraybuffer";

    ws.onopen = function() {
        alert("Connected.")
        sendFile();
    };

    ws.onmessage = function(evt) {
        alert(evt.msg);
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


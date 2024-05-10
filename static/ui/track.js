(function() {

    'use strict';

    var applicationName = "ApiApp";
    angular.module(applicationName, []);

    function ApiController($http, $scope) {
        var self = this;

        self.device = null;
        self.devices = [];
        self.video = null;

        self.canvas = null;
        self.canvasContext = null;
        self.hiddenCanvas = null;
        self.hiddenCanvasContext = null;

        self.face = null;
        self.faces = [];

        self.values = {
            model: 'Facenet512',
            metric: 'euclidean_l2',
            models: ['VGG-Face', 'Facenet', 'Facenet512', 'OpenFace', 'DeepFace', 'DeepID', 'Dlib', 'ArcFace', 'SFace'],
            metrics: ['cosine', 'euclidean', 'euclidean_l2'],
            data: {}
        };

        self.init = function() {
            self.video = document.getElementById('webcam');
            self.canvas = document.getElementById('webcanvas');
            self.canvasContext = self.canvas.getContext('2d');
            self.hiddenCanvas = document.createElement('canvas');
            self.hiddenCanvasContext = self.hiddenCanvas.getContext('2d');
            document.getElementById('file').addEventListener('change', self.fileChange);
            navigator.mediaDevices.enumerateDevices().then(function(devices) {
                for (let i = 0; i < devices.length; i++) {
                    var device = devices[i];
                    if (device.kind === 'videoinput') {
                        self.devices.push({ deviceId: device.deviceId ? device.deviceId : 'default', deviceLabel: device.label ? device.label : 'default' });
                        self.device = self.devices[0];
                    }
                }
                $scope.$apply();
            }).catch(function(err) {
                console.log("navigator.mediaDevices.enumerateDevices() error: " + err);
            });
        };

        self.fileChange = function($event) {
            if ($event.target.value) {
                self.trackend();
                var reader = new FileReader();
                reader.onload = function() {
                    const img = new Image();
                    img.onload = () => {
                        self.canvas.width = img.width;
                        self.canvas.height = img.height;
                        self.canvasContext.drawImage(img, 0, 0, self.canvas.width, self.canvas.height);
                        self.face = null;
                        self.faces = [];
                        $scope.$apply();
                    };
                    img.src = reader.result;
                }
                reader.readAsDataURL($event.target.files[0]);
            }
        };

        self.play = function() {
            self.stop();
            const videoConstraints = {
                video: true,
                audio: false
            };
            navigator.mediaDevices.getUserMedia(videoConstraints).then(function(stream) {
                self.video.srcObject = stream;
                self.video.play();
            }).catch(function(err) {
                console.log("navigator.mediaDevices.getUserMedia() error: " + err);
            });
        };

        self.stop = function() {
            if (self.video.srcObject) {
                self.video.pause();
                const tracks = self.video.srcObject.getVideoTracks();
                for (let i = 0; i < tracks.length; i++) {
                    tracks[i].stop();
                }
                self.video.srcObject = null;
            }
        };

        self.click = function() {
            if (self.video.srcObject) {
                self.trackend();
                self.canvas.width = self.video.videoWidth;
                self.canvas.height = self.video.videoHeight;
                self.canvasContext.drawImage(self.video, 0, 0, self.canvas.width, self.canvas.height);
                self.face = null;
                self.faces = [];
                $scope.$apply();
            }
        };

        self.detect = function() {
            self.canvas.toBlob(function(blob) {
                var formData = new FormData();
                formData.append('image', new File([blob], 'image.png', { type: 'image/png' }));
                formData.append('model', self.values.model);
                $http({
                    method: 'POST',
                    url: '../api/v1/deepface/detect',
                    headers: { 'Content-Type': undefined },
                    data: formData
                }).then(function(response) {
                    self.canvasContext.strokeStyle = "yellow";
                    self.canvasContext.fillStyle = self.canvasContext.strokeStyle;
                    self.face = null;
                    self.faces = [];
                    if (response.data.entries) {
                        for (let i = 0; i < response.data.entries.length; i++) {
                            var rect = response.data.entries[i];
                            self.canvasContext.rect(rect.x, rect.y, rect.width, rect.height);
                            self.canvasContext.font = "15px sans-serif";
                            self.canvasContext.fillText('' + i, rect.x + 2, rect.y + 15);
                            var faceId = i + '=x:' + rect.x + ';y:' + rect.y + ';w:' + rect.width + ';h:' + rect.height;
                            var face = {
                                id: faceId,
                                face: rect,
                                embedding: response.data.embeddings[i],
                                embeddingStr: JSON.stringify(response.data.embeddings[i]).replace('[', '').replace(']', '')
                            }
                            self.faces.push(face);
                            self.face = self.faces[0];
                        }
                        self.canvasContext.stroke();
                    }
                }, function(response) {
                    console.log(response.data);
                });
            }, 'image/png');
        };

        self.track = function() {
            if (self.video.srcObject && self.face) {
                self.values.track = true;
                self.find();
            }
        };

        self.find = function() {
            if (self.video.srcObject && self.face && self.values.track) {
                self.hiddenCanvas.width = self.video.videoWidth;
                self.hiddenCanvas.height = self.video.videoHeight;
                self.hiddenCanvasContext.drawImage(self.video, 0, 0);
                self.hiddenCanvas.toBlob(function(blob) {
                    var formData = new FormData();
                    formData.append('image', new File([blob], 'image.png', { type: 'image/png' }));
                    formData.append('embedding', self.face.embeddingStr);
                    formData.append('model', self.values.model);
                    formData.append('metric', self.values.metric);
                    $http({
                        method: 'POST',
                        url: '../api/v1/deepface/track',
                        headers: { 'Content-Type': undefined },
                        data: formData
                    }).then(function(response) {
                        if (response.data.entries && response.data.entries.length > 0) {
                            self.canvas.width = self.video.videoWidth;
                            self.canvas.height = self.video.videoHeight;
                            self.canvasContext.drawImage(self.hiddenCanvas, 0, 0);
                            self.canvasContext.strokeStyle = "yellow";
                            for (let i = 0; i < response.data.entries.length; i++) {
                                if (response.data.results[i].verified) {
                                    var rect = response.data.entries[i];
                                    self.canvasContext.rect(rect.x, rect.y, rect.width, rect.height);
                                }
                            }
                            self.canvasContext.stroke();
                        }
                        setTimeout(self.find(), 0);
                    }, function(response) {
                        console.log(response.data);
                    });
                }, 'image/png');
            }
        };

        self.trackend = function() {
            self.values.track = false;
        };

        self.init();
    }

    angular.module(applicationName).controller('ApiController', ['$http', '$scope', ApiController]);

}());
var debug = require('debug')('placebacon:server'),
    storage = require('azure-storage'),
    http = require('http'),
    util = require('util'),
    crypto = require('crypto');
    express = require('express'),
    app = express();

var imageCount = 10;

function selectImage(width, height) {
    var md5 = crypto.createHash('md5');
    md5.update(width + '-' + height);
    var hash = md5.digest('hex');
    return parseInt(hash, 16) % imageCount;
}

var blobService = storage.createBlobService();
var containerName = 'placeholder-images';
blobService.createContainerIfNotExists(containerName, function(err, result, response) {
    if (err) {
        console.log("Couldn't create container %s", containerName);
        console.error(err);
    } else {
        if (result) {
            console.log('Container %s created', containerName);
        } else {
            console.log('Container %s already exists', containerName);
        }
    }
});

app.set('port', process.env.PORT || 3000);

// Matches /100/200 -> 100x200 image
// Matches /100     -> 100x100 image
app.get('/:width/:height?', function(req, res, next) {
    var width = parseInt(req.params.width);
    var height = req.params.height ? parseInt(req.params.height) : width; 

    // If width or height isn't a number, go to next route
    if (isNaN(width) || isNaN(height)) {
        next();
        return;
    }

    var selectedImage = 0; // TODO: choose a random image

    var blobName = util.format("%d-%d-%s", width, height, selectedImage);
    blobService.getBlobProperties(
        containerName,
        blobName,
        function(err, properties, status) {
            if (status.isSuccessful) {
                res.header('Content-Type', 'image/jpeg');
                blobService.createReadStream(containerName, blobName).pipe(res);
            } else {
                // Blob doesn't exist
                // Fetch it from the service
                var urlTemplate = 'http://placebacon.net/%d/%d?image=%d';
                var imageUrl = util.format(urlTemplate, width, height, selectedImage);

                debug('Fetching from %s', imageUrl);
                http.get(imageUrl, function(imageResponse) {
                    if (200 !== imageResponse.statusCode) {
                        debug('Unexpected response: %d - %s',
                              imageResponse.statusCode, imageResponse.statusMessage);
                        res.send(502, imageResponse.statusMessage);
                        return;
                    } else {

                        // Create a write  stream for caching the response to blob storage
                        var writeStream = blobService.createWriteStreamToBlockBlob(
                            containerName,
                            blobName,
                            { contentType: 'image/jpeg' },
                            function(error, result, response){
                                if(error){
                                    console.log("Couldn't upload blob %s", blobName);
                                    console.error(error);
                                } else {
                                    console.log('Blob %s uploaded', blobName);
                                }
                            });

                        imageResponse.pipe(writeStream);

                        res.header('Content-Type', 'image/jpeg');
                        imageResponse.pipe(res);
                    }
                }).on('error', function(err) {
                    console.error('Error fetching from %s: %j', imageUrl, err);
                    res.send(502, util.format("Error downloading %s: %s", imageUrl, e.message));
                });
            }
        });
});

var server = app.listen(app.get('port'), function() {
    debug('Placebacon server listening on port %d', server.address().port);
});

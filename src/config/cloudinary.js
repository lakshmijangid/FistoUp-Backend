const cloudinary = require('cloudinary').v2;

// Reads the CLOUDINARY_URL env var (cloudinary://<api_key>:<api_secret>@<cloud_name>)
// automatically. Set it in .env.
cloudinary.config({
    secure: true
});

module.exports = cloudinary;

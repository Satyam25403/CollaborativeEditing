const upload = require('../config/multer');

function handleUpload(fieldName) {
  return (req, res, next) => {
    const uploader = upload.single(fieldName);
    uploader(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };
}

module.exports = { handleUpload };
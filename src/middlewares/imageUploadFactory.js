import fs from "fs/promises";
import multer from "multer";
import path from "path";

const IMAGE_SIGNATURE_BYTES = 16;
const IMAGE_MIME_BY_TYPE = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
};
const IMAGE_EXTENSION_BY_TYPE = {
    jpeg: ".jpg",
    png: ".png",
    webp: ".webp",
};

async function readFileHeader(filePath) {
    const handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(IMAGE_SIGNATURE_BYTES);

    try {
        await handle.read(buffer, 0, buffer.length, 0);
        return buffer;
    } finally {
        await handle.close();
    }
}

function detectImageType(buffer) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "jpeg";
    }

    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return "png";
    }

    if (
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "webp";
    }

    return null;
}

function collectUploadedFiles(req) {
    const files = [];

    if (req.file) {
        files.push(req.file);
    }

    if (Array.isArray(req.files)) {
        files.push(...req.files);
    } else if (req.files && typeof req.files === "object") {
        Object.values(req.files).forEach((value) => {
            if (Array.isArray(value)) {
                files.push(...value);
            }
        });
    }

    return files.filter((file) => file?.path);
}

async function cleanupUploadedFiles(files) {
    await Promise.all(
        files.map((file) =>
            fs.unlink(file.path).catch(() => {})
        )
    );
}

async function normalizeUploadedImage(file) {
    const header = await readFileHeader(file.path);
    const imageType = detectImageType(header);

    if (!imageType) {
        throw new Error("File upload không phải ảnh hợp lệ");
    }

    const expectedExtension = IMAGE_EXTENSION_BY_TYPE[imageType];
    const currentExtension = path.extname(file.filename || file.path).toLowerCase();

    if (currentExtension !== expectedExtension) {
        const parsed = path.parse(file.path);
        const nextPath = path.join(parsed.dir, `${parsed.name}${expectedExtension}`);

        await fs.rename(file.path, nextPath);
        file.path = nextPath;
        file.filename = path.basename(nextPath);
    }

    file.mimetype = IMAGE_MIME_BY_TYPE[imageType];
}

function wrapUploader(middleware) {
    return (req, res, next) => {
        middleware(req, res, async (err) => {
            if (err) {
                return next(err);
            }

            const uploadedFiles = collectUploadedFiles(req);
            if (uploadedFiles.length === 0) {
                return next();
            }

            try {
                for (const file of uploadedFiles) {
                    // Validate actual file signature and normalize extension
                    await normalizeUploadedImage(file);
                }
                return next();
            } catch (validationError) {
                await cleanupUploadedFiles(uploadedFiles);
                return next(validationError);
            }
        });
    };
}

export function createValidatedImageUpload(options) {
    const uploader = multer(options);

    return {
        single(fieldName) {
            return wrapUploader(uploader.single(fieldName));
        },
        fields(fields) {
            return wrapUploader(uploader.fields(fields));
        },
    };
}

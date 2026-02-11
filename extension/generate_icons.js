import fs from 'fs';
import path from 'path';

const iconSizes = [16, 48, 128];
const iconsDir = path.join(process.cwd(), 'icons');

// Simple 1x1 transparent PNG base64
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const buffer = Buffer.from(base64Png, 'base64');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
}

iconSizes.forEach(size => {
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
    console.log(`Created icon${size}.png`);
});


import exifr from 'exifr';
import fs from 'fs/promises';

const FILE_PATH = '/Users/bytedance/Downloads/IMG_4379.HEIC';

async function testHeic() {
    try {
        console.log(`Reading file: ${FILE_PATH}`);
        const buffer = await fs.readFile(FILE_PATH);
        console.log(`File size: ${buffer.length} bytes`);

        console.log('Extracting GPS...');
        const gps = await exifr.gps(buffer);
        console.log('GPS Data:', gps);

        console.log('Extracting Metadata...');
        const metadata = await exifr.parse(buffer);
        console.log('Metadata (first 10 keys):', Object.keys(metadata || {}).slice(0, 10));

    } catch (error) {
        console.error('Error:', error);
    }
}

testHeic();

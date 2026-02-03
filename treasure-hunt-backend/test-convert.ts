
import fs from 'fs/promises';
import convert from 'heic-convert';

const FILE_PATH = '/Users/bytedance/Downloads/IMG_4379.HEIC';

async function testConvert() {
    try {
        console.log(`Reading file: ${FILE_PATH}`);
        const buffer = await fs.readFile(FILE_PATH);
        
        console.log('Converting to JPEG...');
        const outputBuffer = await convert({
            buffer: buffer, // the HEIC file buffer
            format: 'JPEG',      // output format
            quality: 1           // the jpeg compression quality, between 0 and 1
        });

        console.log('Conversion successful!');
        console.log(`Output size: ${outputBuffer.length} bytes`);
        
        await fs.writeFile('output.jpg', Buffer.from(outputBuffer));
        console.log('Saved to output.jpg');

    } catch (error) {
        console.error('Conversion failed:', error);
    }
}

testConvert();

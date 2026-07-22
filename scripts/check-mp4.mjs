import fs from 'fs';

const filePath = '/Users/kavin/Documents/BEXO/Bexo-Onboarding-Flow/Background.MP4';
const fd = fs.openSync(filePath, 'r');
const buffer = Buffer.alloc(100);
fs.readSync(fd, buffer, 0, 100, 0);
fs.closeSync(fd);

console.log('First 100 bytes hex:', buffer.toString('hex'));
console.log('First 100 bytes ASCII:', buffer.toString('ascii').replace(/[^\x20-\x7E]/g, '.'));

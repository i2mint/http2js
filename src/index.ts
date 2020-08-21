import Http2jsClient from './http2js-client';

let fs: any;
try {
    // tslint:disable-next-line:no-var-requires
    fs = require('fs');
} catch {
    fs = null;
}

export function mkClientFromFile(path: string): Http2jsClient {
    if (!fs) {
        throw new Error('Cannot read from the file system in a browser environment.');
    }
    const openapiSpec: any = fs.readFileSync(path)
    return new Http2jsClient(openapiSpec);
}

export default Http2jsClient;

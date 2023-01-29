import * as util from 'util';
import * as fs from 'fs';

/**
 * Асинхронное чтение файла
 * @param sFileName
 */
export async function faReadFile(sFileName: string) {
    return util.promisify(fs.readFile)(sFileName, 'utf8');
}

// Информация о приложении
// Модуль для получения root пути приложения и объявления глобальных констант

import * as path from 'path';

// Имя приложения
export const sAppName = 'aa_neuron';

// Директория приложения
export const sAppDir = path.normalize(__dirname);

// Директория корня приложения
export const sRootDir = path.normalize(__dirname +  '/..');

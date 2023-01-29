import dayjs from 'dayjs';

export const FORMAT_DATE_TIME = 'YYYY-MM-DD HH:mm:ss'; // формат даты и времени
export const FORMAT_DATE = 'YYYY-MM-DD'; // формат даты
export const FORMAT_TIME = 'HH:mm:ss'; // формат времени

export const SQL_FORMAT_DATE_TIME = '%Y-%m-%d %H:%i:%S'; // формат даты и времени для SQL
export const SQL_FORMAT_DATE = '%Y-%m-%d'; // формат даты для SQL
export const SQL_FORMAT_TIME = '%H:%i:%S'; // формат времени для SQL

export const V_FORMAT_DATE_TIME = /^\d{4}-([0-1][0-9])-([0-3][0-9]) ([0-2][0-9]):([0-5][0-9]):([0-5][0-9])$/; // формат даты и времени для валидатора
export const V_FORMAT_DATE = /^\d{4}-([0-1][0-9])-([0-3][0-9])$/; // формат даты для валидатора
export const V_FORMAT_TIME = /^([0-2][0-9]):([0-5][0-9]):([0-5][0-9])$/; // формат времени для валидатора

/**
 * Форматирование даты
 * @param inp - Дата
 * @returns - string
 */
export function mFormatDate(inp?: dayjs.ConfigType): string {
    return dayjs(inp).format(FORMAT_DATE);
}

/**
 * Форматирование даты и времени
 * @param inp - Дата и время
 * @returns - string
 */
export function mFormatDateTime(inp?: dayjs.ConfigType): string {
    return dayjs(inp).format(FORMAT_DATE_TIME);
}

/**
 * Форматирование времени
 * @param inp - Время
 * @returns - string
 */
export function mFormatTime(inp?: dayjs.ConfigType): string {
    return dayjs(inp).format(FORMAT_TIME);
}

/** Секунд от начала времен */
export function mDateValue(inp?: dayjs.ConfigType): number {
    return Math.round(dayjs(inp).valueOf() / 1000);
}

/**
 * Копирование даты из даты и времени
 * @param inp - Время
 * @returns - string
 */
export function mGetDate(inp: string): string {
    return inp.match(/^\d{4}-([0-1][0-9])-([0-3][0-9])/)?.[0];
}

/** Действия с ботом */
export enum ContextT {
    none = 0,
    lib=1,
    web=2,
    img=3,
    dialog=4,
}

export interface ContextI {
    id:number; // ID
    hash:string; // хеш текста
    type:ContextT; // Тип контекста
	text:string; // Текстовый контекст
}

export class ContextE {

    static NAME = 'context'
}
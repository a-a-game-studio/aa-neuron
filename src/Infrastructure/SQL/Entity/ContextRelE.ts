
/** Связный контекст */


export interface ContextRelI {
    id:number; // ID
    context_id:number; // хеш текста
    rel_id:number; // Связь
}

export class ContextRelE {

    static NAME = 'context__rel'
}
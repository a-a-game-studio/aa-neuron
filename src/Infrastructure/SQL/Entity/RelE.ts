
/** Связный контекст */


export interface RelI {
    id:number; // ID
    prev_word_id:number; // предыдущее слово
    word_id:number; // осн слово
    next_word_id:number; // следущее слово
}

export class RelE {

    static NAME = 'rel'
}
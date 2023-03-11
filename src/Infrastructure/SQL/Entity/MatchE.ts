
export interface MatchI {
    id:number; // ID
    hash:string; // Хеш совпадения
	ctx_id:number; // Текст слова
    step:number; // шаг 
	len: number // длинна контекста
	prev_match_id: number;
	next_match_id : number; // id базового слова
	pos_x: number; // Позиция в контексте
    pos_y: number; // позиция в контексте
    size_x: number; // размер контекста 
    size_y: number; // размер контекста 
    data: Buffer; // данные по совпадению
}

export class MatchE {

    static NAME = 'match'
}
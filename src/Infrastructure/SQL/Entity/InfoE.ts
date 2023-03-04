
export interface InfoI {
    id?:number; // ID
	entity_word_id:number;
    entity_where_word_id:number;
    desc_word_id:number;
    val_pos_word_id?:number;
    val_word_id:number;
    val_where_word_id?:number;
}

export class InfoE {

    static NAME = 'info'
}

/** Действия с ботом */
enum WordCatT {
    none = 0,
    entity= 1, // Сущьность - существительное
    action = 2, // Действие - глагол
    prop = 3, // Свойство - прилагательное
    alias = 4, // Псевдоним - местоимение
    preposition = 5, // Предлог
    adverb = 6 // Наречие
}

interface WordI {
    id:number; // ID
	word:string; // Текст слова
	q:number; // Количество заданных вопросов системой по слову
	cat: WordCatT; // Категория слова
	desc: string;
	word_base_id : number; // id базового слова
	if_sinonim: boolean; // Синоним
}

class WordE {

    static NAME = 'word'
}
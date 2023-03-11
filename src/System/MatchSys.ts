import _ from "lodash";
import md5 from "md5";
import { ContextE, ContextT } from "../Infrastructure/SQL/Entity/ContextE";
import { MatchE } from "../Infrastructure/SQL/Entity/MatchE";
import { WordE, WordI } from "../Infrastructure/SQL/Entity/WordE";
import { db } from "./DBConnect";

export class MatchSys {
    async fAnalizeText(sText:string){
        console.log('================================================================================')
        console.log(sText);
        console.log('================================================================================')

        // Разбор предложения
        let asWordRead = _.uniq(sText.match(/([а-яёa-z0-9]{1,50})/gi) || []);

        // console.log('==',asWordRead);

        const aWordDB:WordI[] = await db(WordE.NAME).whereIn('word', asWordRead).select('id','word', 'cat');

        const ixWordDbWord = _.keyBy(aWordDB, 'word');
        const ixWordDbByCat = _.groupBy(aWordDB, 'cat');
        const ixWordDb = _.keyBy(aWordDB, 'id');

        for (let i = 0; i < aWordDB.length; i++) {
            const vWordDB = aWordDB[i];

            await this.fAnalizeWord(vWordDB.word);
            
        }
    }

    async fAnalizeWord(sText:string){
        const sWordLow = sText.toLowerCase()

        
        const hText = md5(sText);

        const idCtx = (await db(ContextE.NAME)
                .insert({
                    hash:hText, // хеш текста
                    type:ContextT.word, // Тип контекста
                    text:sText // Текстовый контекст
                }))[0];

        for (let i = 0; i < sWordLow.length; i++) {
            const sChar = sWordLow[i];

            if (i === 0 || i === sWordLow.length - 1) {
                continue;
            }

            const sCharLeft = sWordLow[i - 1];
            const sCharRight = sWordLow[i + 1];

            // console.log(sCharLeft, sChar, sCharRight);

            const sMatch = [sCharLeft, sChar, sCharRight].join('-');
            const hMatch = md5(sMatch)

            const cntMatchExist = (await db(MatchE.NAME).where('hash', hMatch).where('ctx_hash', hText).where('data',sMatch).count({cnt:'*'}))[0].cnt || 0;

            if(cntMatchExist > 0){
                continue;
            }

            await db(MatchE.NAME)
                .insert({
                    hash:hMatch,  // Хеш совпадения
                    ctx_id:idCtx, // Текст слова
                    ctx_hash:hText,
                    step:1, // шаг 
                    len: sText.length - 2, // длинна контекста
                    prev_match_id: 0,
                    next_match_id: 0, // id базового слова
                    pos_x: i, // Позиция в контексте
                    pos_y: 0, // позиция в контексте
                    size_x: sText.length - 2, // размер контекста
                    size_y: 0, // размер контекста 
                    data: sMatch, // данные по совпадению
                });
            
        }
    }

    async fMatchText(sText:string, type:'all'|'start'|'end'){
        const sWordLow = sText.toLowerCase()
        const hText = md5(sWordLow);

        const iMatchCollision = sText.length / 2

        const ahMatch:string[] = [];

        for (let i = 0; i < sWordLow.length; i++) {
            const sChar = sWordLow[i];

            if (i === 0 || i === sWordLow.length - 1) {
                continue;
            }

            const sCharLeft = sWordLow[i - 1];
            const sCharRight = sWordLow[i + 1];

            console.log(sCharLeft, sChar, sCharRight);

            const sMatch = [sCharLeft, sChar, sCharRight].join('-');
            const hMatch = md5(sMatch)
            ahMatch.push(hMatch);
        }
        const qCommon = db({m:MatchE.NAME})
            .leftJoin({ctx:'context'}, 'ctx.id', 'm.ctx_id')
            .whereIn('m.hash', ahMatch)
            .groupBy('m.ctx_hash')
            .count({cnt_match_chunk:'m.id'})
            .count({cnt_match:'m.ctx_hash'})
            

            if(type == 'all'){
                qCommon.havingRaw(`cnt_match >= ${iMatchCollision}`)
                    .select(db.raw(`ABS(m.len - ${ahMatch.length}) as hit_match , SUM(if(m.pos_x = 1 && m.hash = '${ahMatch[0]}', 1, 0)) as is_first`))
                    .orderBy([
                        {column:'cnt_match', order:'DESC'},
                        {column:'is_first', order:'DESC'},
                        {column:'hit_match', order:'ASC'}
                    ]);
            }
            if(type == 'end'){
                qCommon.havingRaw(`cnt_match_chunk >= ${iMatchCollision}`)
                qCommon.whereRaw('((m.pos_x = m.len) OR (m.pos_x = m.len - 1))')
                .orderBy([
                    {column:'cnt_match_chunk', order:'DESC'},
                ]);
            }            

            const aMatchExist = await qCommon.select('ctx.text')

                
            
            

            console.log(aMatchExist)

            console.log(qCommon.select('ctx.text').toString())
            
    }
}
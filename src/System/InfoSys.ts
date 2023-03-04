
// дурсль проживали в доме
// дурсль нормальные это люди
// дурсль попали в ситуацию сомнительно
// дурсль относились к странностям неодобрительно
// дурсль относились к загадкам неодобрительно
// дурсль полный это мужчина
// дурсль пышными с усами
// дурсль короткой с шеей
// дурсль длиннее с щеей
// дурсль тощая это блондинка
// дурсль маленький есть сын
// дурсль сын это Дадли
// дурсль сын был Дадли
// дадли чудесный это ребенок
// семья имела все

import e from "express";
import _, { includes } from "lodash";
import { InfoI } from "../Infrastructure/SQL/Entity/InfoE";
import { WordCatT, WordE, WordI } from "../Infrastructure/SQL/Entity/WordE";
import { db } from "./DBConnect";

const asAlias = ['он', 'его', 'их', 'они', 'них']
const ixAlias = _.keyBy(asAlias);

const aEntityCtx:WordI[] = [];

export class InfoSys {
    prev_text:string;

    async fAnalize(sText:string){
        console.log('========================================')
        console.log(sText);
        console.log('========================================')

        sText = sText.split(',').join(' , ')

        
        // Разбор предложения
        let asWordRead = sText.match(/([а-яёa-z0-9,]{1,50})/gi) || [];

        // console.log('==',asWordRead);

        const aWordDB:WordI[] = await db(WordE.NAME).whereIn('word', asWordRead).select('id','word', 'cat');
        aWordDB.push(...aEntityCtx);
        console.log('==find==',asWordRead);
        console.log('==no_explain==', aWordDB.filter(el => el.cat == 0).map(el => el.word));
        

        const ixWordDbWord = _.keyBy(aWordDB, 'word');
        const ixWordDbByCat = _.groupBy(aWordDB, 'cat');
        const ixWordDb = _.keyBy(aWordDB, 'id');

        
        let aEntity:WordI[] = [];
        let aEntityTarget:WordI[] = [];
        let aVerb:WordI[] = [];
        let aProp:WordI[] = [];

        let ixWhere:Record<number, WordI> = {};
        let ixPreposition:Record<number, WordI> = {};

        const aInsertInfo:InfoI[] = [];
        for (let i = 0; i < asWordRead.length; i++) {
            const sWordRead = asWordRead[i];

            let sWordReadPrev = '';
            if(i > 0){
                sWordReadPrev = asWordRead[i - 1];
            }

            if(sWordRead == ','){
                console.log('chunk phrase',
                    aEntity.map(el => el.word),
                    aVerb.map(el => el.word), 
                    aProp.map(el => el.word),
                    aEntityTarget.map(el => el.word)
                )
                if(aEntity.length && (aVerb.length || aProp.length) && aEntityTarget.length){
                    const aDesc = [...aVerb, ...aProp];
                    for (let j = 0; j < aEntity.length; j++) {
                        const vEntity = aEntity[j];
                        for (let c = 0; c < aDesc.length; c++) {
                            const vDesc = aDesc[c];

                            for (let k = 0; k < aEntityTarget.length; k++) {
                                const vEntityTarget = aEntityTarget[k];

                                aInsertInfo.push({
                                    entity_word_id:vEntity.id,
                                    entity_where_word_id:ixWhere[vEntity.id]?.id || 0,
                                    desc_word_id:vDesc.id,
                                    val_pos_word_id:ixPreposition[vEntityTarget.id]?.id || 0,
                                    val_word_id:vEntityTarget.id,
                                    val_where_word_id:ixWhere[vEntityTarget.id]?.id || 0,
                                    
                                })
                            }
                        }
                    }
                }
                aEntity = [];
                aVerb = [];
                aProp = [];
                aEntityTarget = [];
                ixWhere = {};
                ixPreposition = {};
                
            }

            if(!ixWordDbWord[sWordRead]){
                continue;
            }

            if(ixWordDbWord[sWordRead].cat == WordCatT.entity){
                if(aVerb.length || aProp.length){
                    if(!aEntityTarget.length){

                        aEntityTarget.push(ixWordDbWord[sWordRead]);
                        if(ixWordDbWord[sWordReadPrev]?.cat == WordCatT.preposition){
                            console.log('--001-->',sWordReadPrev, sWordRead)
                            ixPreposition[ixWordDbWord[sWordRead].id] = ixWordDbWord[sWordReadPrev];
                            
                        }
                        
                    } else if(aEntityTarget.length && _.includes([',', 'и', 'или'], sWordReadPrev)){
                        aEntityTarget.push(ixWordDbWord[sWordRead]);
                    } else if(aEntityTarget.length && ixWordDbWord[sWordReadPrev]?.cat == WordCatT.entity){
                        for (let x = 0; x < aEntityTarget.length; x++) {
                            const vEntityTarget = aEntityTarget[x];

                            console.log('--01-->',sWordReadPrev, sWordRead)
                            ixWhere[vEntityTarget.id] = ixWordDbWord[sWordRead];
                        }
                    }
                } else {
                    
                    if(!aEntity.length){
                        aEntity.push(ixWordDbWord[sWordRead]);
                        aEntityCtx.push(ixWordDbWord[sWordRead]);    
                    } else if(aEntity.length && _.includes([',', 'и', 'или'], sWordReadPrev)){
                        aEntity.push(ixWordDbWord[sWordRead]);
                        aEntityCtx.push(ixWordDbWord[sWordRead]);    
                    } else if(aEntity.length && ixWordDbWord[sWordReadPrev]?.cat == WordCatT.entity){
                        for (let x = 0; x < aEntity.length; x++) {
                            const vEntity = aEntity[x];

                            console.log('--1-->',sWordReadPrev, sWordRead)
                            ixWhere[vEntity.id] = ixWordDbWord[sWordRead];
                        }
                    }


                    
                }
            }

            if(ixWordDbWord[sWordRead].cat == WordCatT.name){
                if(aVerb.length || aProp.length){
                    aEntityTarget.push(ixWordDbWord[sWordRead]);
                } else {
                    // console.log('---->',sWordReadPrev, sWordRead)
                    if(!aEntity.length){
                        aEntity.push(ixWordDbWord[sWordRead]);
                        aEntityCtx.push(ixWordDbWord[sWordRead]);    
                    } else if(aEntity.length && _.includes([',', 'и', 'или'], sWordReadPrev)){
                        aEntity.push(ixWordDbWord[sWordRead]);
                        aEntityCtx.push(ixWordDbWord[sWordRead]);    
                    } else if(aEntity.length && ixWordDbWord[sWordReadPrev]?.cat == WordCatT.entity){
                        for (let x = 0; x < aEntity.length; x++) {
                            console.log('-2--->',aEntity.map(el => el.word), sWordRead)
                            const vEntity = aEntity[x];
                            ixWhere[vEntity.id] = ixWordDbWord[sWordRead];
                        }
                        
                    }
                }
            }

            if(ixWordDbWord[sWordRead].cat == WordCatT.alias){
                
                if(aVerb.length || aProp.length){
                    aEntityTarget.push(...aEntityCtx);
                } else {
                    aEntity.push(...aEntityCtx);
                }
                console.log('-3--->',aEntity.map(el => el.word), sWordRead)
            }

            if(ixWordDbWord[sWordRead].cat == WordCatT.action){
                aVerb.push(ixWordDbWord[sWordRead]);
            }

            if(ixWordDbWord[sWordRead].cat == WordCatT.prop){
                aProp.push(ixWordDbWord[sWordRead]);
            }
            
        }

        console.log('chunk phrase',
            aEntity.map(el => el.word),
            aVerb.map(el => el.word), 
            aProp.map(el => el.word),
            aEntityTarget.map(el => el.word)
        )
        if(aEntity.length && (aVerb.length || aProp.length) && aEntityTarget.length){
            const aDesc = [...aVerb, ...aProp];
            for (let j = 0; j < aEntity.length; j++) {
                const vEntity = aEntity[j];
                for (let c = 0; c < aDesc.length; c++) {
                    const vDesc = aDesc[c];

                    for (let k = 0; k < aEntityTarget.length; k++) {
                        const vEntityTarget = aEntityTarget[k];


                        aInsertInfo.push({
                            entity_word_id:vEntity.id,
                            entity_where_word_id:ixWhere[vEntity.id]?.id || 0,
                            desc_word_id:vDesc.id,
                            val_pos_word_id:ixPreposition[vEntityTarget.id]?.id || 0,
                            val_word_id:vEntityTarget.id,
                            val_where_word_id:ixWhere[vEntityTarget.id]?.id || 0,
                            
                        })
                    }
                }
            }
        }

        // console.log('>>>aInsertInfo>>>',aInsertInfo);

        for (let j = 0; j < aInsertInfo.length; j++) {
            const vInsertInfo = aInsertInfo[j];
            console.log(
                ixWordDb[vInsertInfo.entity_word_id].word,
                ixWordDb[vInsertInfo.entity_where_word_id]?.word || '',
                ixWordDb[vInsertInfo.desc_word_id].word,
                ixWordDb[vInsertInfo.val_pos_word_id]?.word || '',
                ixWordDb[vInsertInfo.val_word_id].word,
                ixWordDb[vInsertInfo.val_where_word_id]?.word || '',
                
            )
            
        }
        

        // console.log('[entity:1]',ixWordDbByCat[1])
        // console.log('[verb:2]',ixWordDbByCat[2])
        // console.log('[prop:3]',ixWordDbByCat[3])
        // console.log('[name:9]',ixWordDbByCat[9])
        // console.log('[alias:9]',ixWordDbByCat[4])
    }
}
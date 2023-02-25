import _ from "lodash";
import md5 from "md5";
import { sRootDir } from "../app";
import { faReadFile } from "../Helper/FileH";
import { ContextE } from "../Infrastructure/SQL/Entity/ContextE";
import { WordCatT, WordE, WordI } from "../Infrastructure/SQL/Entity/WordE";
import { db } from "./DBConnect";



export class ReadSys {

    public async faReadLib(sFile:string){

        const ixWord:Record<string, number> = {};
    
        const sText = await faReadFile(sFile);
    
        // return;
    
        let iCount = (await db(WordE.NAME).max({cnt:'id'}))[0].cnt;
    
        const aExistWord:WordI[] = await db(WordE.NAME).select();
        for (let i = 0; i < aExistWord.length; i++) {
            const vExistWord = aExistWord[i];
            // console.log(vExistWord);
            ixWord[vExistWord.word] = vExistWord.id;
            
        }
    
        console.log( iCount);
    
        // const asText = [];
    
        const asText = sText.split('\n\n')
    
        let cntRead = 0;
    
        let asTextNew:string[] = [];
        for (let c = 0; c < asText.length; c++) {
            const sText = asText[c];

            // Добавляем контекст
            const sContext = (sText.match(/([а-яёa-z0-9,.]{1,50})/gi) || []).join(' ').toLowerCase();
            const sContextHash = md5(sContext);
            

            let vContext = null;
            if(sContext.length > 0){
                vContext = await db(ContextE.NAME).where('hash', sContextHash).first();
            }
            
            if(!vContext && sContext.length){
                console.log('>>>>',sContextHash, sContext)
                const idContext = await db(ContextE.NAME).insert({
                    hash: sContextHash,
                    text: sContext
                });
            }

    
            const asTextSplit = sText.split('.').filter(el =>  el.length > 1 )
    
            for (let i = 0; i < asTextSplit.length; i++) {
                const sTextSplit = asTextSplit[i].toLowerCase();
                let asWordRead = sTextSplit.match(/([а-яёa-z0-9]{1,50})/gi) || [];
    
                const aWordDB:WordI[] = await db(WordE.NAME).whereIn('word', asWordRead).select();
    
                const ixWordDb = _.keyBy(aWordDB, 'word');
    
                const aiStructPhrasa = [];
                for (let j = 0; j < asWordRead.length; j++) {
                    const vWordReadDb = ixWordDb[asWordRead[j]];
                    let vWordReadNext = null;
                    let idWordReadNext = 0;
                    let vWordReadPrev = null;
                    let idWordReadPrev = 0;
                    if(j + 1 < asWordRead.length){
                        vWordReadNext = ixWordDb[asWordRead[j+1]];
                        if(vWordReadNext){ // Если запись нашли получаем ID
                            idWordReadNext = vWordReadNext.id;
                        } else {
                            idWordReadNext = -1;
                        }
                    }

                    if(j > 0){
                        vWordReadPrev = ixWordDb[asWordRead[j-1]];
                        if(vWordReadPrev){ // Если запись нашли получаем ID
                            idWordReadPrev = vWordReadPrev.id;
                        } else {
                            idWordReadPrev = -1;
                        }
                    }
    
                    if(vWordReadDb && vWordReadDb.cat > 0){
                        aiStructPhrasa.push(vWordReadDb.cat);
                    } else {
                        aiStructPhrasa.push(0);
                    }
    
                    if(vWordReadDb && idWordReadPrev >= 0 && idWordReadNext >= 0){
    
                        // console.log(vWordRead.word, vWordReadNext.word)
    
                        const iCntWord = (await db('rel')
                            .where('prev_word_id', idWordReadPrev)
                            .where('word_id', vWordReadDb.id)
                            .where('next_word_id', idWordReadNext)
                            .count({cnt:'*'}))[0].cnt;
    
                        if(!iCntWord){
                            console.log('[', vWordReadDb.word,'-',vWordReadPrev?.word || '','-', vWordReadNext?.word || '',']', iCntWord, ' - read:', c,i,j)
                            const idNewRel = await db('rel').insert({
                                prev_word_id: idWordReadPrev,
                                word_id: vWordReadDb.id, 
                                next_word_id: idWordReadNext
                            });
                        } else {
                            process.stdout.write('.');
                            cntRead++;
                            if(cntRead % 1000 == 0){
                                console.log('read:', cntRead, ':', 'it' , ':',c,'/',asText.length, ':',i,j)
                            }
                        }
                        
                    }
                }
    
                if(aiStructPhrasa.length){
                    const sStructure = aiStructPhrasa.join('-')
                    const idPhraseStruct = (await db('phrase_struct').where('structure', sStructure).select('id'))[0]?.id || 0;
                    if(idPhraseStruct){
                        await db('phrase_struct').where('structure', sStructure).increment('cnt');
                    } else {
                        await db('phrase_struct').where('structure', sStructure).insert({structure:sStructure, cnt:1}).onConflict().ignore();
                    }
                }
    
                // console.log(aWordDB.map(el => el.word.toLowerCase()));
    
                asTextNew.push(..._.difference(asWordRead, aWordDB.map(el => el.word.toLowerCase())));
    
                // console.log(_.difference(asWordRead, aWordDB.map(el => el.word.toLowerCase())));
            }
    
            
            
        }
    
        
    
    
        asTextNew = _.uniq(asTextNew);
    
        const aInsertWord = [];
        for (let j = 0; j < asTextNew.length; j++) {
            const sTextClear = asTextNew[j];
    
            if(!ixWord[sTextClear]){
                const iNewWord = ++iCount
                ixWord[sTextClear] = iNewWord;
                aInsertWord.push({
                    id:iNewWord,
                    word:sTextClear
                })
            }
        }
    
        if(aInsertWord.length){
            console.log(aInsertWord.map(el => el.word));
            await db('word').insert(aInsertWord).onConflict().ignore();
        }
    }


    /** Индексация словаря */
    public async faReadDict(tWordCat:WordCatT){
        let sDictOrigin:string = '';
        if(tWordCat == WordCatT.entity){
            sDictOrigin = await faReadFile(sRootDir + '/data/dict/slovar_sush.txt')
        } else if(tWordCat == WordCatT.action){
            sDictOrigin = await faReadFile(sRootDir + '/data/dict/slovar_glag.txt')
        } else if(tWordCat == WordCatT.prop){
            sDictOrigin = await faReadFile(sRootDir + '/data/dict/slovar_prilag.txt')
        } else if(tWordCat == WordCatT.alias){
            sDictOrigin = await faReadFile(sRootDir + '/data/dict/slovar_mestoim.txt')
        } else {
            console.log('Не поняла какой словарь нужно индексировать')
            return;
        }

        let iCount = (await db('word').max({cnt:'id'}))[0].cnt;

        // const aDictSection = sDictOrigin.split('=====').map(el => el.trim())

        const aWord:string[] = sDictOrigin.split(/\n\n/).map(el => el.trim());

        // aWord.push(...sDictSection.split(/\n\n/).map(el => el.trim()));

        const aWordInsert:{
            id:number,
            word:string,
            cat:WordCatT
            desc?:string
        }[] = []
        for (let i = 0; i < aWord.length; i++) {
            const sWord = aWord[i];
            const iDescPos = sWord.indexOf('-');
            const sWordClean = sWord.substring(0,iDescPos).trim()
            const sDescClean = sWord.substring(iDescPos).trim()

            aWordInsert.push({
                id: ++iCount,
                word:sWordClean,
                cat:tWordCat,
                desc:sDescClean
            })
        }

        if(aWordInsert.length){
            const aaWordInsertChunk = _.chunk(aWordInsert,1000)
            for (let i = 0; i < aaWordInsertChunk.length; i++) {
                const aWordInsertChunk = aaWordInsertChunk[i];

                // console.log(aWordInsertChunk);
                await db('word').insert(aWordInsertChunk).onConflict().ignore();
            }
            
        }

        // console.log('sHtml>>>',aWordInsert);
    }
}

export const gReadSys = new ReadSys();
import axios from 'axios'
import e from 'express';
import _ from 'lodash';
import { chunk, split } from 'lodash';
import path from 'path';
import readline from 'readline'
import { sRootDir } from './app';
import { faReadFile } from './Helper/FileH';
import puppeteer from 'puppeteer';

import { db } from "./System/DBConnect";
import { mWait } from './Helper/WaitH';
import { mRandomInteger } from './Helper/NumberH';

let iCount = 0;
const ixRelation:Record<number, number[]> = {}
const ixWord:Record<string, number> = {};
const ixWordInvert:Record<number, string> = {};

/** Действия с ботом */
enum ActionT {
    indexation= 1,
    relation = 2,
    catagoryzation = 3
}

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

interface WordI{
    id:number;
    word:string;
    q:number;
    cat:WordCatT;
    desc:string;
}



/** Попросить ввести */
function askQuestion(query:string) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

async function faIndexation(){
    let sHtml:string = (await axios.get('https://dictants.com/1-klass/diktanty-1-klass-1-chetvert/')).data

    iCount = (await db('word').max({cnt:'id'}))[0].cnt;

    const aExistWord = await db('word').select();
    for (let i = 0; i < aExistWord.length; i++) {
        const vExistWord = aExistWord[i];
        // console.log(vExistWord);
        ixWord[vExistWord.word] = vExistWord.id;
        
    }

    console.log( iCount);

    const asText = [];

    // sHtml = sHtml.split('<div class="text">').join('_s__');
    // sHtml = sHtml.split('<span class="dictant').join('__s_');

    const iLeftSize = '<div class="text">'.length;
    const iRightSize = '<span class="dictant'.length;
    
    for (let i = 0; i < sHtml.length; i++) {
        const iLeft = sHtml.indexOf('<div class="text">', i)
        
        if(iLeft < 0){
            break;
        }
        const iRight = sHtml.indexOf('<span class="dictant', iLeft)

        // console.log(iLeft+iLeftSize, iRight)
        asText.push(sHtml.substring(iLeft+iLeftSize, iRight))

        i = iRight+iRightSize;
    }

    let asTextNew:string[] = [];
    for (let i = 0; i < asText.length; i++) {
        const sText = asText[i];

        const asTextSplit = sText.split('.').filter(el =>  el.length > 1 )


        for (let i = 0; i < asTextSplit.length; i++) {
            const sTextSplit = asTextSplit[i].toLowerCase();
            let asWordRead = sTextSplit.match(/([а-яёa-z0-9]{1,50})/gi) || [];

            const aWordDB:WordI[] = await db('word').whereIn('word', asWordRead).select();

            const ixWordDb = _.keyBy(aWordDB, 'word');

            const aiStructPhrasa = [];
            for (let j = 0; j < asWordRead.length; j++) {
                const vWordReadDb = ixWordDb[asWordRead[j]];
                let vWordReadNext = null;
                if(j + 1 < asWordRead.length){
                    vWordReadNext = ixWordDb[asWordRead[j+1]];
                }

                if(vWordReadDb && vWordReadDb.cat > 0){
                    aiStructPhrasa.push(vWordReadDb.cat);
                } else {
                    aiStructPhrasa.push(0);
                }

                if(vWordReadDb && vWordReadNext){

                    // console.log(vWordRead.word, vWordReadNext.word)

                    const iCntWord = (await db('rel').where('word_id', vWordReadDb.id).where('word_rel_id', vWordReadNext.id).count({cnt:'*'}))[0].cnt;

                    if(!iCntWord){
                        console.log(vWordReadDb.word, vWordReadNext.word, iCntWord)
                        const idNewRel = await db('rel').insert({word_id: vWordReadDb.id, word_rel_id: vWordReadNext.id});
                    }
                    
                }
            }

            if(aiStructPhrasa.length){
                const sStructure = aiStructPhrasa.join('-')
                const idPhraseStruct = (await db('phrase_struct').where('structure', sStructure).select('id'))[0]?.id || 0;
                if(idPhraseStruct){
                    await db('phrase_struct').where('structure', sStructure).increment('cnt');
                } else {
                    await db('phrase_struct').where('structure', sStructure).insert({structure:sStructure, cnt:1});
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
async function faIndexationDict(tWordCat:WordCatT){
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

    iCount = (await db('word').max({cnt:'id'}))[0].cnt;

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

/** определение связности */
async function faRelation(){
    const aWordQuestion = await db('word').select().orderBy('q', 'asc').limit(2);
    const aidWordQuestion = aWordQuestion.map(el => el.id);
    const aWordEq = await db('word').whereNotIn('id', aidWordQuestion).select().orderBy('q', 'desc').limit(2);

    console.log('q:',aWordQuestion, 'eq:',aWordEq);

    
    for (let i = 0; i < aWordQuestion.length; i++) {
        const vWordQuestion = aWordQuestion[i]
        for (let j = 0; j < aWordEq.length; j++) {
            const vWordEq = aWordEq[j];

            const aAutoResp = await db('rel').where('word_id', vWordQuestion.id).where('word_rel_id', vWordEq.id).select('id')

            if(aAutoResp.length == 0){
                const ans = await askQuestion(`Связаны? ${vWordQuestion.word} и ${vWordEq.word} - да/нет: `);

                console.log('Вы ввели:',ans)

                if(ans == 'да'){
                    await db('rel').insert({'word_id': vWordQuestion.id, 'word_rel_id': vWordEq.id, 'status':1})
                } else if(ans == 'нет') {
                    await db('rel').insert({'word_id': vWordQuestion.id, 'word_rel_id': vWordEq.id, 'status':0})
                } else {
                    console.log('Не поняла ответ');
                }

                
            }
        }
        
        
        
    }
    await db('word').whereIn('id', aidWordQuestion).increment('q');
}

async function fSearchYandex(vWordQuestion:{word:string,id:number}): Promise<string>{
    const sLeftBlock = 'Быстрый ответ';
    const sRightBlock = 'Результаты поиска';

    const iLeftSize = sLeftBlock.length;
    const iRightSize = sRightBlock.length;

    console.log('https://yandex.ru/search/?text='+vWordQuestion.word+' часть речи');

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://yandex.ru/search/?text='+vWordQuestion.word+' часть речи', {waitUntil: 'domcontentloaded'});

    const sTextPage = await page.evaluate(() => document.querySelector('body').innerText);

    browser.close();

    let iLeft = sTextPage.indexOf(sLeftBlock, 0);
        
    if(iLeft < 0){
        return '';
    }
    const iRight = sTextPage.indexOf(sRightBlock, iLeft)

    // console.log(iLeft+iLeftSize, iRight)
    const sDesc = sTextPage.substring(iLeft+iLeftSize, iRight).toLowerCase();

    return sDesc

}

async function fSearchMorfologi(vWordQuestion:{word:string,id:number}){
    let sLeftBlock = 'морфологический разбор: '+vWordQuestion.word;
    const sRightBlock = 'начальная форма';

    const iLeftSize = sLeftBlock.length;
    const iRightSize = sRightBlock.length;

    console.log('https://morphological.ru/'+vWordQuestion.word);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://morphological.ru/'+vWordQuestion.word, {waitUntil: 'domcontentloaded'});

    let sTextPage = await page.evaluate(() => document.querySelector('body').innerText);
    if(sTextPage){
        sTextPage = sTextPage.toLowerCase();
    }

    

    browser.close();

    let iLeft = sTextPage.indexOf(sLeftBlock, 0);

    sLeftBlock = 'часть речи и все грамматические'
    
    iLeft = sTextPage.indexOf(sLeftBlock, iLeft);

    
        
    if(iLeft < 0){
        return '';
    }
    let iRight = sTextPage.indexOf(sRightBlock, iLeft)

    if(iRight < 0){
        iRight = sTextPage.indexOf('разбор 2', iLeft)
    }

    // console.log(iLeft+iLeftSize, iRight)
    const sDesc = sTextPage.substring(iLeft+sLeftBlock.length, iRight).toLowerCase();

    // console.log('--->',sDesc, sTextPage);

    return sDesc


}

async function fSearchMakeWord(vWordQuestion:{word:string,id:number}){
    const sLeftBlock = 'морфологический разбор';
    const sRightBlock = 'езультаты поиска';

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://yandex.ru/search/?text='+vWordQuestion.word+' часть речи', {waitUntil: 'domcontentloaded'});

    const sTextPage = await page.evaluate(() => document.querySelector('body').innerText);

    browser.close();

    return sTextPage

}


async function faCategorization(){
    const aWordQuestion = await db('word').where('cat', '=', 0).select().orderBy('q','asc').limit(2);

    const sLeftBlock = 'Быстрый ответ';
    const sRightBlock = 'Результаты поиска';

   
    // const sLeftBlock = '<table>';
    // const sRightBlock = '</table>';
    
    const iLeftSize = sLeftBlock.length;
    const iRightSize = sRightBlock.length;


    for (let i = 0; i < aWordQuestion.length; i++) {
        const vWordQuestion = aWordQuestion[i];


        await db('word').where('id', '=', vWordQuestion.id).increment('q');

        

        // let sHtml:string = (await axios.get('https://makeword.ru/morphology/%D0%B1%D0%BE%D0%B1%D1%80%D1%8B')).data;

        // const browser = await puppeteer.launch();
        // const page = await browser.newPage();
// 
        // await page.goto('https://morphological.ru/'+encodeURI('vWordQuestion.word'), {waitUntil: 'domcontentloaded'});
        // await page.goto('https://yandex.ru/search/?text='+vWordQuestion.word+' часть речи', {waitUntil: 'domcontentloaded'});

        // console.log(await page.content());

        // const sTextPage = await page.evaluate(() => document.querySelector('body').innerText);

        const sDesc = await fSearchMorfologi(vWordQuestion)//await page.content();

        // console.log(sTextPage)

        // console.log(sHtml);

        // let iLeft = sHtml.indexOf(sLeftBlock, 0);
        
        // if(iLeft < 0){
        //     break;
        // }
        // const iRight = sHtml.indexOf(sRightBlock, iLeft)

        // // console.log(iLeft+iLeftSize, iRight)
        // const sDesc = sHtml.substring(iLeft+iLeftSize, iRight).toLowerCase();

        // Разбор
        let bExistDesc = sDesc.indexOf(vWordQuestion.word, 0) >= 0;

        if(bExistDesc){
            let tWordCat = WordCatT.none;
            const iPosBaseForm = sDesc.indexOf('начальная форма', 0);
            if(iPosBaseForm >= 0){
                const iEndLine = sDesc.indexOf('\n', iPosBaseForm);
                const sBaseForm = sDesc.substring(iPosBaseForm+'начальная форма:'.length, iEndLine).trim();
                console.log('Базовая форма:', sBaseForm)
            }
            const iPosCategory = sDesc.indexOf('часть речи', 0);
            if(iPosCategory >= 0){
                const iEndLine = sDesc.indexOf('\n', iPosCategory);
                const sCategory = sDesc.substring(iPosCategory+'часть речи:'.length, iEndLine).trim();
                console.log('Часть речи:', sCategory)

                if(sDesc.indexOf('сущ', iPosCategory) >= 0){
                    console.log('Часть речи существительное:', sCategory)
                    tWordCat = WordCatT.entity;
                    await db('word').where('id', '=', vWordQuestion.id).update({cat:WordCatT.entity});
                }
                if(sDesc.indexOf('прил', iPosCategory) >= 0){
                    console.log('Часть речи прилагательное:', sCategory)
                    tWordCat = WordCatT.prop;
                    await db('word').where('id', '=', vWordQuestion.id).update({cat:WordCatT.prop});
                }

                if(sDesc.indexOf('глаг', iPosCategory) >= 0){
                    console.log('Часть речи глагол:', sCategory)
                    tWordCat = WordCatT.action;
                    await db('word').where('id', '=', vWordQuestion.id).update({cat:WordCatT.action});
                }

                if(sDesc.indexOf('предлог', iPosCategory) >= 0){
                    console.log('Часть речи предлог:', sCategory)
                    tWordCat = WordCatT.preposition;
                    await db('word').where('id', '=', vWordQuestion.id).update({cat:WordCatT.preposition});
                }

                if(sDesc.indexOf('нареч', iPosCategory) >= 0){
                    console.log('Часть речи наречие:', sCategory)
                    tWordCat = WordCatT.adverb;
                    await db('word').where('id', '=', vWordQuestion.id).update({cat:WordCatT.adverb});
                }

                
            }
            const iPosFormWord = sDesc.indexOf('формы', 0);
            if(iPosFormWord >= 0){
                const iEndLine = sDesc.indexOf('\n', iPosFormWord);
                const asFormWord = sDesc.substring(iPosFormWord+'формы:'.length, iEndLine).trim().split(',').map(el => el.trim());
                console.log('Форма:', asFormWord)

                for (let j = 0; j < asFormWord.length; j++) {
                    const sFormWord = asFormWord[j];
                    const iCountFormWord = (await db('word').where('word', '=').count({cnt:'id'}))[0]?.cnt || 0;
                    if(!iCountFormWord){
                        await db('word').insert({word:sFormWord,cat:0}).onConflict().merge('word')
                    }
                    
                }
            }


            if(tWordCat == WordCatT.none){
                let iMinPosCat = 10000;
                const iPosEntity = sDesc.indexOf('сущ', iPosCategory)
                const iPosAction = sDesc.indexOf('прил', iPosCategory)
                const iPosProp = sDesc.indexOf('глаг', iPosCategory)
                const iPosPreposition = sDesc.indexOf('предлог', iPosCategory)
                const iPosAdverb = sDesc.indexOf('нареч', iPosCategory)
                if(iPosEntity >= 0 && iPosEntity < iMinPosCat){
                    iMinPosCat = iPosEntity;
                    tWordCat = WordCatT.entity
                }
                if(iPosAction >= 0 && iPosAction < iMinPosCat){
                    iMinPosCat = iPosAction;
                    tWordCat = WordCatT.action
                }
                if(iPosProp >= 0 && iPosProp < iMinPosCat){
                    iMinPosCat = iPosProp;
                    tWordCat = WordCatT.prop
                }
                if(iPosPreposition >= 0 && iPosPreposition < iMinPosCat){
                    iMinPosCat = iPosPreposition;
                    tWordCat = WordCatT.preposition
                }
                if(iPosAdverb >= 0 && iPosAdverb < iMinPosCat){
                    iMinPosCat = iPosAdverb;
                    tWordCat = WordCatT.adverb
                }

                if(tWordCat){
                    console.log('Часть речи type:', tWordCat)

                    await db('word').where('id', '=', vWordQuestion.id).update({cat:tWordCat});
                }
               
            }
        } else {
            console.log('===========Не нашел============');
        }

        

        console.log('===========TEXT============');

        console.log(sDesc);


        mWait(mRandomInteger(5, 10)*1000);

        
    }

}

async function run(){

    // await faIndexationDict(WordCatT.action);
    // await faIndexationDict(WordCatT.entity);
    // await faIndexationDict(WordCatT.alias);
    // await faIndexationDict(WordCatT.prop);

    // await faIndexation()

    await faCategorization();


    // console.log('Индексация:' , ActionT.indexation)
    // console.log('Связи:', ActionT.relation)
    // console.log('категоризация:', ActionT.catagoryzation)
    // const ans = await askQuestion(`Выберите действие?:`);

    // console.log('Вы ввели:',ans)

    // if(Number(ans) ==  ActionT.indexation){
    //     await faIndexation()
    // } else if(Number(ans) ==  ActionT.relation) {
    //     await faRelation()
    // } else if(Number(ans) ==  ActionT.catagoryzation) {
    //     await faCategorization();
    // } else {
    //     console.log('Не поняла ответ');
    // }


    
    process.exit(0); // завершить программу

}

run();
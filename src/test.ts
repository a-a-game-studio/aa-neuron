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
import { ReadSys } from './System/ReadSys';
import { WordCatT, WordI, WordE } from './Infrastructure/SQL/Entity/WordE';
import { RelI } from './Infrastructure/SQL/Entity/RelE';
import { ContextE } from './Infrastructure/SQL/Entity/ContextE';
import { InfoSys } from './System/InfoSys';


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

async function faIndexation(sUrl:string){
    // let sHtml:string = (await axios.get(sUrl)).data

    let sHtml = await fGetTextFromWeb(sUrl)

    // const iLeft = fFindStart(sHtml, ['контрольные и проверочные диктанты по русскому языку'])

    // const sHtml = 'категория «диктанты»'

    

    // return;

    iCount = (await db('word').max({cnt:'id'}))[0].cnt;

    const aExistWord = await db('word').select();
    for (let i = 0; i < aExistWord.length; i++) {
        const vExistWord = aExistWord[i];
        // console.log(vExistWord);
        ixWord[vExistWord.word] = vExistWord.id;
        
    }

    console.log( iCount);

    const asText = [];

    sHtml = sHtml.split('категория «диктанты»').join('_s__');
    sHtml = sHtml.split('\nдиктанты').join('__s_');

    console.log(sHtml);

    


    const iLeftSize = '_s__'.length;
    const iRightSize = '__s_'.length;
    
    for (let i = 0; i < sHtml.length; i++) {
        const iLeft = sHtml.indexOf('_s__', i)
        
        if(iLeft < 0){
            break;
        }
        const iRight = sHtml.indexOf('__s_', iLeft)

        if(iRight < 0){
            break;
        }

        // console.log(iLeft+iLeftSize, iRight)
        asText.push(sHtml.substring(iLeft+iLeftSize, iRight))

        // console.log(sHtml.substring(iLeft+iLeftSize, iRight));

        i = iRight+iRightSize;

        process.stdout.write('.')
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

async function fGetTextFromWeb(sUrl:string){
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    console.log('URL>>>',sUrl)
    await page.goto(sUrl, {waitUntil: 'domcontentloaded'});

    const sTextPage = await page.evaluate(() => document.querySelector('body').innerText);

    browser.close();

    return sTextPage.toLowerCase();
}

function  fFindStart(sText:string, asMatch:string[]): number{

    // console.log('_____________________________________')
// 


    let iLeft = 0;
    let iStart = 0;
    let iEnd = 0;
    let iMatchCount = 0;

        
    for (let i = 0; i < asMatch.length; i++) {
        const sMatch = asMatch[i].toLowerCase();
        
        
        iLeft = sText.indexOf(sMatch, iLeft)

        if(i == 0){

            iEnd = sText.indexOf('\n', iLeft)
        }

        if(iLeft >=0 ){
            if(iLeft > iEnd){
                i = -1;
                
            }
        } else {
            iLeft = -1;
        }

        iLeft+=sMatch.length

        const sDesc = sText.substring(iLeft, iEnd).toLowerCase();
    // console.log('|||',sMatch,'|||',sDesc,'|||')
    // console.log('start-pos>>>',i,iLeft, iEnd, sText.length)

        
    }
    
    // iEnd = sText.indexOf("\n", iLeft)
    // const sDesc = sText.substring(iLeft, iEnd).toLowerCase();
    // console.log('|||',sDesc)
    // console.log('start-pos>>>',iLeft, iEnd, sText.length)

    // console.log('===================================')

    return iLeft;
}


async function fSearchSinonim_Synonim(vWordQuestion:{word:string,id:number}){

    const sTextPage = await fGetTextFromWeb('https://sinonim.org/s/'+vWordQuestion.word)

    // console.log('text-page>>>', sTextPage);

    const iLeftPos = fFindStart(sTextPage, ['Синоним', 'начальная форма', 'Частота']);

    const iEndPos = fFindStart(sTextPage, ['Не нашли нужный синоним?']);

    const sDesc = sTextPage.substring(iLeftPos, iEndPos);

    
    const asDesc =  sDesc.split('\n');
    // console.log(asDesc)
    const asSinonim = [];
    for (let i = 0; i < asDesc.length; i++) {
        const sDescLine = asDesc[i];
        // console.log('====>',sDescLine);
        let asWordRead = sDescLine.match(/[0-9]{1,4}\t([а-яё]{1,50}).*\t([0-9.]{1,6})/i) || [];

        if(asWordRead[1]){

            if(Number(asWordRead[2]) > 10){
            console.log(asWordRead[1], asWordRead[2]);
            }

            asSinonim.push(asWordRead[1])
        }
        // console.log(_.uniq(asWordRead)
        
    }

    
    return _.uniq(asSinonim).slice(0,5)

}

async function faSynonimization(){
    const aWordQuestion = await db('word').where('if_sinonim', '=', 0).select().orderBy('q','desc').limit(10);

    for (let i = 0; i < aWordQuestion.length; i++) {
        const vWordQuestion = aWordQuestion[i];

        console.log('_____________________________________')

        console.log('Поиск синонима:', vWordQuestion.word);
        // console.log('word>>>',vWordQuestion);

        const asSinonim = await fSearchSinonim_Synonim(vWordQuestion);

        console.log('Синонимы:', asSinonim)

        for (let i = 0; i < asSinonim.length; i++) {
            const sSinonim = asSinonim[i];
            
        
            const idSinonimWord:number = (await db('word').where('word', '=', sSinonim).select('id'))[0]?.id || 0;
            if(!idSinonimWord){
                await db('word').insert({word:sSinonim,cat:0}).onConflict().merge('word')
            } else {
                const idSinonimRel:number = (await db('sinonim')
                    .where('word_id', '=', vWordQuestion.id)
                    .where('word_sinonim_id', '=', idSinonimWord)
                    .select('id'))[0]?.id || 0;

                if(!idSinonimRel){
                    await db('sinonim').insert({word_id:vWordQuestion.id, word_sinonim_id:idSinonimWord}).onConflict().ignore()

                }

                
            }
        }

        await db('word').where({id:vWordQuestion.id}).update({ if_sinonim:1}).onConflict().merge('word')

        console.log('===================================')

        await mWait(mRandomInteger(1, 3)*1000);

    }
}

async function faCategorization(){
    const aWordQuestion = await db('word').where('cat', '=', 0).select().orderBy('q','asc').limit(100);


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

                if(sDesc.indexOf('местои', iPosCategory) >= 0){
                    console.log('Часть речи местоимение:', sCategory)
                    tWordCat = WordCatT.action;
                    await db('word').where('id', '=', vWordQuestion.id).update({cat:WordCatT.alias});
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


        await mWait(mRandomInteger(1, 3)*1000);

        
    }

}


const aConfDict = [
    'https://dictants.com/1-klass/diktanty-1-klass-1-chetvert/',
    'https://dictants.com/1-klass/diktanty-1-klass-2-chetvert/',
    'https://dictants.com/1-klass/diktanty-1-klass-3-chetvert/',
    'https://dictants.com/1-klass/diktanty-1-klass-4-chetvert/',
    'https://dictants.com/1-klass/itogovye-diktanty-za-1-klass/',

    'https://dictants.com/2-klass/diktanty-2-klass-1-chetvert/',
    'https://dictants.com/2-klass/diktanty-2-klass-2-chetvert/',
    'https://dictants.com/2-klass/diktanty-2-klass-3-chetvert/',
    'https://dictants.com/2-klass/diktanty-2-klass-4-chetvert/',
    'https://dictants.com/2-klass/itogovye-diktanty-za-2-klass/',

    'https://dictants.com/3-klass/diktanty-3-klass-1-chetvert/',
    'https://dictants.com/3-klass/diktanty-3-klass-2-chetvert/',
    'https://dictants.com/3-klass/diktanty-3-klass-3-chetvert/',
    'https://dictants.com/3-klass/diktanty-3-klass-4-chetvert/',
    'https://dictants.com/3-klass/itogovye-diktanty-za-3-klass/',

    'https://dictants.com/4-klass/diktanty-4-klass-1-chetvert/',
    'https://dictants.com/4-klass/diktanty-4-klass-2-chetvert/',
    'https://dictants.com/4-klass/diktanty-4-klass-3-chetvert/',
    'https://dictants.com/4-klass/diktanty-4-klass-4-chetvert/',
    'https://dictants.com/4-klass/itogovye-diktanty-za-4-klass/',

    'https://dictants.com/5-klass/diktanty-5-klass-1-chetvert/',
    'https://dictants.com/5-klass/diktanty-5-klass-2-chetvert/',
    'https://dictants.com/5-klass/diktanty-5-klass-3-chetvert/',
    'https://dictants.com/5-klass/diktanty-5-klass-4-chetvert/',
    'https://dictants.com/5-klass/itogovye-diktanty-za-5-klass/',

    'https://dictants.com/6-klass/diktanty-6-klass-1-chetvert/',
    'https://dictants.com/6-klass/diktanty-6-klass-2-chetvert/',
    'https://dictants.com/6-klass/diktanty-6-klass-3-chetvert/',
    'https://dictants.com/6-klass/diktanty-6-klass-4-chetvert/',
    'https://dictants.com/6-klass/itogovye-diktanty-za-6-klass/',
]

async function fGenPhrase(asWord:string[], lenSearch:number){
    const aWordQuery = await db('word').whereIn('word', asWord).select();

    if(!aWordQuery.length){
        return;
    }

    const ixWordFindRel:Record<number, number[]> = {};
    
    let aidWordNextSearch:number[] = [aWordQuery[0].id]
    let idWordSelect:number = 0;
    const aidWordPhrase:number[] = [];
    
    for (let i = 0; i < lenSearch; i++) {
        
        
        const dbQuery = db('rel').whereIn('word_id', aidWordNextSearch)
        if(idWordSelect > 0){
            dbQuery.where('prev_word_id', idWordSelect)
        }

        const aRel:RelI[] = await dbQuery.select('prev_word_id','word_id', 'next_word_id');
        // console.log('ixWordFindRel:',Object.keys(ixWordFindRel))
        // 
        const aidWordSelect = _.uniq(aRel.map(el => el.word_id));

        // Подборка случайных значений
        const iRelPos = mRandomInteger(0, aidWordSelect.length - 1);

        idWordSelect = aidWordSelect[iRelPos] || 0

        const ixWordNextSearch = _.groupBy(aRel,'word_id');

        if(ixWordNextSearch[idWordSelect]?.length){
            aidWordNextSearch = _.uniq(ixWordNextSearch[idWordSelect].map(el => el.next_word_id))
        } else {
            aidWordNextSearch = _.uniq(aRel.map(el => el.next_word_id));
            console.log('НЕНЕШЕЛ КОРРЕКТНЫЕ СВЯЗИ')
        }

        if(idWordSelect){
            aidWordPhrase.push(idWordSelect);
        }
        

        // for (let j = 0; j < aRel.length; j++) {
        //     const vRel = aRel[j];

        //     if(!ixWordFindRel[vRel.word_id]){
        //         ixWordFindRel[vRel.word_id] = [];
        //     } 

        //     ixWordFindRel[vRel.word_id].push(vRel.next_word_id);
            
        // }

    }

    


    // const asWordWuery = aWordQuery.map(el => el.word);
    // const ixWordQuery = _.keyBy(aWordQuery, 'id');
    // const ixWordQueryText = _.keyBy(aWordQuery, 'word');
    // const sWordFirst = asWord[0]
    // let idWordFind = ixWordQueryText[asWord[0]].id
    // const aidWordPhrase = [idWordFind];
    // for (let i = 0; i < lenSearch; i++) {


    //     const aidRel = ixWordFindRel[idWordFind];

    //     if(aidRel){
    //         const iRelPos = mRandomInteger(0, aidRel.length - 1);

    //         idWordFind = aidRel[iRelPos];

    //         aidWordPhrase.push(idWordFind);
    //     } else {
            
    //         console.log('Не найдено')
    //         break;
    //     }
    // }

    console.log('aidWordPhrase',aidWordPhrase);

    const aWordPhrase = await db('word').whereIn('id', aidWordPhrase).select();
    const ixWordPhrase = _.keyBy(aWordPhrase, 'id');

    // console.log(aidWordPhrase, ixWordPhrase)

    // console.log(ixWordPhrase);
    const asOut = [];
    for (let i = 0; i < aidWordPhrase.length; i++) {
        const idWordPhrase = aidWordPhrase[i];
        const sWord = ixWordPhrase[idWordPhrase].word;
        asOut.push(sWord);
    }

    console.log('>>>',asOut.join(' '))
    
    console.log('END')
}

async function fQuestionPhrase(sEntity:string, sQuestion:string){
    

    

    const vWordEntity = await db('word').where('word', sEntity).first();
    const vWordQuestion = await db('word').where('word', sQuestion).first();

    if(!vWordEntity || !vWordQuestion){
        return;
    }
    const aWordUnion = await db('word').where('cat', WordCatT.union).select();

    // const ixWordQueryByWord = _.keyBy(aWordQuery, 'word');

    let bFind = false;
    let bFail = false;

    // let aidWordNextSearch:number[] = [aWordQuery[0].id]
    // do {
    //     const dbQuery = db('rel').whereIn('word_id', aidWordNextSearch)
    //     if(idWordSelect > 0){
    //         dbQuery.where('prev_word_id', idWordSelect)
    //     }

        
    // } while (!bFind && !bFail);


    const aRelEntity:RelI[] = await db('rel').where('word_id', vWordEntity.id).select('prev_word_id','word_id', 'next_word_id');
    const aRelQuestion:RelI[] = await db('rel').where('word_id', vWordEntity.id).select('prev_word_id','word_id', 'next_word_id');

    const aRel:RelI[]  = await db('rel')
        .where('prev_word_id', vWordEntity.id)
        .where('word_id', vWordQuestion.id)
        .select('prev_word_id','word_id', 'next_word_id');

    const aidNextWord = aRel.map(el => el.next_word_id)

    

    for (let i = 0; i < aRel.length; i++) {
        const vRelUnion = aRel[i];

        
        
        const vWord = await db('word').whereIn('id', [vRelUnion.next_word_id]).first('word');

        const aRelNext:any[] = await db({rel:'rel'})
            .leftJoin({ w: WordE.NAME }, 'w.id', 'rel.next_word_id') // Подцепляем форумную таблицу топиков
            .where('prev_word_id', vWordQuestion.id)
            .where('word_id', vRelUnion.next_word_id)
            .distinct('w.id')
            .select('prev_word_id','word_id', 'next_word_id', 'w.word');

        console.log('>>>',sEntity, sQuestion, vWord.word, aRelNext.map(el => el.word));
    }

        

    // const aRelEntityNext:RelI[] = await db('rel').where('word_id', vWordEntity.id).select('prev_word_id','word_id', 'next_word_id');
    // const aRelQuestionPrev:RelI[] = await db('rel').where('word_id', vWordEntity.id).select('prev_word_id','word_id', 'next_word_id');
}

async function fSuggestPhrase(sWord:string, sMatch?:string){
    
    const vWord = await db('word').where('word', sWord).first();

    if(!vWord){
        return;
    }

    // const ixWordQueryByWord = _.keyBy(aWordQuery, 'word');

    let bFind = false;
    let bFail = false;

    // let aidWordNextSearch:number[] = [aWordQuery[0].id]
    // do {
    //     const dbQuery = db('rel').whereIn('word_id', aidWordNextSearch)
    //     if(idWordSelect > 0){
    //         dbQuery.where('prev_word_id', idWordSelect)
    //     }

        
    // } while (!bFind && !bFail);


    const aRel:RelI[] = await db('rel').where('word_id', vWord.id).select('prev_word_id','word_id', 'next_word_id');
    const aidNextWord = aRel.map(el => el.next_word_id)
    const aWordSuggest = await db('word').whereIn('id', aidNextWord).select('word');
    let asWordMatch:string[] = [];
    if(sMatch){
        for (let i = 0; i < aWordSuggest.length; i++) {
            const vWordSuggest = aWordSuggest[i];
    
            
            if(vWordSuggest.word.indexOf(sMatch) == 0){
                asWordMatch.push(vWordSuggest.word);
            }
            
        }
    } else {
        asWordMatch = aWordSuggest.map(el => el.word);
    }
    
    console.log('>>>', asWordMatch)

    // for (let i = 0; i < aRel.length; i++) {
    //     const vRelUnion = aRelUnion[i];
    //     const aWordUnion = await db('word').whereIn('id', [vRelUnion.next_word_id, vRelUnion.prev_word_id, vRelUnion.word_id]).select();

    //     console.log('>>>',aWordUnion);
    // }

        

    // const aRelEntityNext:RelI[] = await db('rel').where('word_id', vWordEntity.id).select('prev_word_id','word_id', 'next_word_id');
    // const aRelQuestionPrev:RelI[] = await db('rel').where('word_id', vWordEntity.id).select('prev_word_id','word_id', 'next_word_id');
}


async function run(){

    // await faIndexationDict(WordCatT.action);
    // await faIndexationDict(WordCatT.entity);
    // await faIndexationDict(WordCatT.alias);
    // await faIndexationDict(WordCatT.prop);

    // await faSynonimization();

    // for (let i = 0; i < aConfDict.length; i++) {
    //     const sURLDict = aConfDict[i];
    //     console.log('===========================================')
    //     console.log('=============faIndexation===============')
    //     console.log(sURLDict)
    //     console.log('===========================================')
        // await faIndexation(sURLDict)
    //     console.log('====================END=======================')
    //     console.log('===========================================')
    // }

    const vReadSys = new ReadSys();
    // await vReadSys.faReadLib(sRootDir + '/data/lib/hary_potter.txt')
    // await vReadSys.faReadLib(sRootDir + '/data/lib/черное копье.txt')

    
    

    // await vReadSys.faReadDict(WordCatT.numeric)

    // await fGenPhrase(['учится'], 10);
    // 
    // await fSuggestPhrase('учился');
    // await fQuestionPhrase('учится', 'в');

    const infoSys = new InfoSys();

    const asText = await db(ContextE.NAME).limit(1000).offset(10).orderBy('id','asc').pluck('text');
    for (let i = 0; i < asText.length; i++) {
        const sText = asText[i];
        await infoSys.fAnalize(sText)
    }
    // console.log(asText);
    

    // await faCategorization();


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
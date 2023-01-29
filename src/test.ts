import axios from 'axios'
import e from 'express';
import _ from 'lodash';
import { chunk, split } from 'lodash';
import path from 'path';
import readline from 'readline'
import { sRootDir } from './app';
import { faReadFile } from './Helper/FileH';

import { db } from "./System/DBConnect";

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
    entity= 1, // Сущьность - существительное
    action = 2, // Действие - глагол
    prop = 3, // Свойство - прилагательное
    alias = 4 // Псевдоним - местоимение
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
    let sHtml:string = (await axios.get('https://dictants.com/1-klass/')).data

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

    for (let i = 0; i < asText.length; i++) {
        const sText = asText[i];
        
        const asTextClear = sText.match(/([а-яёa-z0-9]{1,50})/gi);

        const aInsertWord = [];
        for (let j = 0; j < asTextClear.length; j++) {
            const sTextClear = asTextClear[j];

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
            await db('word').insert(aInsertWord);
        }
        
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

async function faCategorization(){
    const aWordQuestion = await db('word').where('car', '=', 0).select().limit(2);

    for (let i = 0; i < aWordQuestion.length; i++) {
    }
}

async function run(){

    await faIndexationDict(WordCatT.action);
    await faIndexationDict(WordCatT.entity);
    await faIndexationDict(WordCatT.alias);
    await faIndexationDict(WordCatT.prop);


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
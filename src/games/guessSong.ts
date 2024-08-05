import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import { NickNameTable, SimpleSongData, SongList } from "../types/song";
import { Context, h, Session } from "koishi"
import { getBestMatch, matchSong } from "../utils/fuzzyMatch";
import * as xlsx from 'xlsx';

interface GamingGroup{
    groupID:string,
    songID:number,
    songName:string,
    countdown:NodeJS.Timeout,
}

const tempAssetPath = path.join(__dirname,'../../../../data/assets/temp')
const songAssetPath = path.join(__dirname,'../../../../data/assets/songMp3')

const songListUrl = 'https://bestdori.com/api/songs/all.7.json'
const nickNamesTableUrl = 'https://raw.githubusercontent.com/Yamamoto-2/tsugu-bangdream-bot/master/backend/config/nickname_song.xlsx'
const songAssetUrl = 'https://bestdori.com/assets/jp/sound' //https://bestdori.com/assets/jp/sound/bgm[songID]_rip/bgm[songID].mp3
const songDataUrl = 'https://bestdori.com/api/songs' //https://bestdori.com/api/songs/[songID].json
let gamingGroups:GamingGroup[] = [] //正在进行猜曲的群组
export let songList:{list:SongList,updateTime:number} = { list: undefined, updateTime: 0 } //所有歌曲的简略数据
let songIDs:number[] = [] //所有歌曲的ID
let nickNamesTable:NickNameTable[] = [] 

export async function guessSongInit(ctx:Context){
    initAssetsFloader()
    await loadNickNameTable(ctx)
}

function initAssetsFloader(){
    if(!fs.existsSync(tempAssetPath)){
        fs.mkdirSync(tempAssetPath)
    }
    if(!fs.existsSync(songAssetPath)){
        fs.mkdirSync(songAssetPath)
    }
}

export async function getAllSongList(ctx:Context){
    const listJsonData = path.join(__dirname,'../../../../data/assets/temp/songList.json')
    const now = Date.now()
    if(fs.existsSync(listJsonData)){
        const stat = fs.statSync(listJsonData)
        if(now - stat.birthtime.getDate() < 1000 * 60 * 60){
            songList.list = JSON.parse(fs.readFileSync(listJsonData,'utf-8'))
            songList.updateTime = now
            songIDs = Object.keys(songList.list).map(Number)
        }
        else{
            await getDataFromNetwork()
        }
    }
    else{
        await getDataFromNetwork()
    }
    async function getDataFromNetwork(){
        songList.list = await ctx.http.get(songListUrl)
        fs.writeFileSync(listJsonData,JSON.stringify(songList.list),'utf-8')
        songList.updateTime = now
        songIDs = Object.keys(songList.list).map(Number)
    }
}

async function loadNickNameTable(ctx:Context){
    const nickNameTablePath = path.join(__dirname,'../../../../data/assets/temp/nickname_song.xlsx')
    const now = Date.now()
    if(fs.existsSync(nickNameTablePath)){
        const stat = fs.statSync(nickNameTablePath)
        // if(now - stat.birthtime.getDate() < 1000 * 60 * 60 * 24){
            const nickNameTable = xlsx.readFile(nickNameTablePath)
            const data = xlsx.utils.sheet_to_json(nickNameTable.Sheets['工作表1']) as any[]
            nickNamesTable = data.map((item) => {
                return{
                    songID:item['Id'],
                    songName:item['Title'],
                    nickNames:item['Nickname']? item['Nickname'].split(','):[]
                }
            })
        // }
        // else{
        //     await getDataFromNetwork()
        // }
    }
    else{
        await getDataFromNetwork()
    }
    async function getDataFromNetwork(){
        const nicknameXLSX = await ctx.http.get(nickNamesTableUrl,{responseType:'arraybuffer'})
        const buffer = Buffer.from(nicknameXLSX)
        fs.writeFileSync(nickNameTablePath,buffer)
        const nickNameTable = xlsx.readFile(nickNameTablePath)
        const data = xlsx.utils.sheet_to_json(nickNameTable.Sheets['工作表1']) as any[]
        nickNamesTable = data.map((item) => {
            return{
                songID:item['Id'],
                songName:item['Title'],
                nickNames:item['Nickname']? item['Nickname'].split(','):[]
            }
        })
    }
}

function getSongIDBySongTitle(name:string):number{
    for(const key in songList.list){
        let musicTitle = ''
        for(let i = 0; i < songList.list[key].musicTitle.length; i++){
            if(songList.list[key].musicTitle[i]){
                musicTitle = songList.list[key].musicTitle[i]
                break
            }
        }
        if(musicTitle == name){
            return Number(key)
        }
    }
    return -1
}

export async function startGuessingSong(ctx:Context, session:Session) {
    //检查歌曲数据库
    await getAllSongList(ctx)
    //检查当前群组是否正在进行猜曲
    if(gamingGroups.some(value => value.groupID == session.channelId)){
        session.send('当前群组正在进行猜曲，发送[结束猜曲]可结束此轮猜曲哦')
        return
    }
    //生成一个随机数作为猜曲答案对应的歌曲ID
    const answerID = getRandomSongID()
    console.log(`[${session.event.channel.name}] 当前要猜的歌曲为: ID${answerID}:`+songList.list[answerID].musicTitle[0])
    gamingGroups.push({groupID:session.channelId, songID:answerID, songName:songList.list[answerID].musicTitle[0], countdown:undefined})
    const audiobuffer = await processedAudio(ctx,answerID,session.channelId)
    if(audiobuffer == undefined){
        session.sendQueued('audio is undefined')
        return
    }
    session.sendQueued('猜曲开始，请发送[。歌曲名]或[。歌曲ID]开始猜曲吧(英文的.也可以哦),时间限制为90s\nTips:本功能还在测试中，歌名匹配不是很准，别名库也还没做，可以先用茨菇的查曲找找ID',500)
    session.sendQueued(h.audio(audiobuffer,'audio/mp3'))
    //设置时间限制
    const index = gamingGroups.findIndex(value => value.groupID == session.channelId)
    const timeout = setTimeout(()=>endGussingSong(session,true),90000)
    gamingGroups[index].countdown = timeout
}

export function endGussingSong(session:Session,autoend:boolean = false){
    const index = gamingGroups.findIndex(value => value.groupID == session.channelId)
    if(index == -1){
        session.send('当前群组没有正在进行猜曲,发送[猜歌曲]开始猜曲吧')
    }
    let messageList = []
    messageList.push(h('img',{src:getJacketUrl(gamingGroups[index].songID)}))
    if(autoend){
        messageList.push(`时间到了,没有人猜对哦，答案是 ${gamingGroups[index].songName}`)
    }
    else{
        messageList.push(`猜曲结束,答案是 ${gamingGroups[index].songName}`)
        clearTimeout(gamingGroups[index].countdown)
    }
    session.send(messageList)
    gamingGroups = gamingGroups.filter(group => group.groupID != session.channelId)
}

function fastEndGussingSong(groupID:string){
    const index = gamingGroups.findIndex(value => value.groupID == groupID)
    clearTimeout(gamingGroups[index].countdown)
    gamingGroups = gamingGroups.filter(group => group.groupID != groupID)
}

export async function checkAnswer(session:Session){
    //检查是否是正在游戏的群成员触发的
    if(gamingGroups.some(value => value.groupID == session.channelId)){
        const index = gamingGroups.findIndex(value => value.groupID == session.channelId)
        const answer = session.content.slice(1)
        if(parseInt(answer)){
            const id = parseInt(answer)
            if(id == gamingGroups[index].songID){
                let messageList = []
                messageList.push(h('img',{src:getJacketUrl(gamingGroups[index].songID)}))
                messageList.push(h('at',{id:session.userId}))
                messageList.push(` 回答正确，答案是${gamingGroups[index].songName}`)
                session.send(messageList)
                fastEndGussingSong(session.channelId)
            }
            else{
                const songName = songList.list[id].musicTitle[0]
                session.send(`答案不是${songName}哦`)
            }
        }
        else{
            const match = matchSong(nickNamesTable,answer)
            console.log('MatchSongs:' + match)
            if(match.length == 1){
                if(match[0] == gamingGroups[index].songName){
                    let messageList = []
                    messageList.push(h('img',{src:getJacketUrl(gamingGroups[index].songID)}))
                    messageList.push(h('at',{id:session.userId}))
                    messageList.push(` 回答正确，答案是${gamingGroups[index].songName}`)
                    session.send(messageList)
                    fastEndGussingSong(session.channelId)
                }
                else{
                    session.send(`答案不是${songList.list[match[0]]}哦`)
                }
            }
            else{
                let msg = `查询到${match.length}首相关歌曲，请在10s内回复[编号]进行选择\n`
                for(let i = 0;i < match.length;i++){
                    msg += `${i+1}.${match[i]}\n`
                }
                msg = msg.slice(0,msg.length-2)
                session.sendQueued(msg)
                const reply = await session.prompt(10000)
                if(parseInt(reply)){
                    const id = parseInt(reply)
                    if(match[id-1] == gamingGroups[index].songName){
                        let messageList = []
                        messageList.push(h('img',{src:getJacketUrl(gamingGroups[index].songID)}))
                        messageList.push(h('at',{id:session.userId}))
                        messageList.push(` 回答正确，答案是${gamingGroups[index].songName}`)
                        session.sendQueued(messageList)
                        fastEndGussingSong(session.channelId)
                    }
                    else{
                        session.sendQueued(`答案不是${match[id-1]}哦`)
                    }
                }
            }
        }
    }
}

function getRandomSongID():number{
    let songIDisOK = false
    let answerID = -1
    while(!songIDisOK){
        const answerIndex = Math.floor(Math.random() * songIDs.length)
        answerID = songIDs[answerIndex]
        if(answerID < 1000){
            const songTilte = songList.list[answerID].musicTitle[0].toLowerCase()
            if( songTilte != undefined && !songTilte.includes('ver') && !songTilte.includes('full') && !songTilte.includes('超高難易度') && !songTilte.includes('（')){
                songIDisOK = true
            }
        }
    }
    return answerID
}

function getSongRip(songID:number){
    return Math.ceil(songID / 10) * 10
}

function getJacketUrl(songID:number):string{
    const songData = songList.list[songID]
    const rip = getSongRip(songID)
    return `https://bestdori.com/assets/jp/musicjacket/musicjacket${rip}_rip/assets-star-forassetbundle-startapp-musicjacket-musicjacket${rip}-${songData.jacketImage[0].toLowerCase()}-jacket.png`
}

async function processedAudio(ctx:Context, songID:number, groupID:string):Promise<Buffer>{
    const idString = songID.toString().padStart(3,'0')
    const filePath = path.join(__dirname,`../../../../data/assets/songMp3/song${idString}.mp3`)
    const tempFilePath = path.join(__dirname,`../../../../data/assets/temp/${groupID}.mp3`)
    let buffer:Buffer
    if(fs.existsSync(filePath)){
        buffer = fs.readFileSync(filePath)
    }
    else{
        const songAudio = await ctx.http.get(`${songAssetUrl}/bgm${idString}_rip/bgm${idString}.mp3`,{ responseType: 'arraybuffer' })
        buffer = Buffer.from(songAudio)
    }
    fs.writeFileSync(filePath,buffer)
    return new Promise<Buffer>((resolve,reject)=>{
        ffmpeg.ffprobe(filePath,(err,metadata)=>{
            if (err) {
                console.error('Error:', err);
                return;
              }
            const duration = Math.floor(metadata.format.duration)
            // console.log('[Log] '+'音频时长为'+duration+'秒');
            const startTime = getRandomAudioCut(duration)
            ffmpeg(filePath)
            .setStartTime(startTime)
            .setDuration(2)
            .output(tempFilePath)
            .on('end', () => {
                // console.log('[Log] '+'已生成两秒的音频');
                const output = fs.readFileSync(tempFilePath)
                fs.unlinkSync(tempFilePath)
                resolve(output)
            })
            .on('error', (err) => {
                console.error('[Error] ', err);
                // 删除临时文件
                fs.unlinkSync(tempFilePath);
                reject(undefined)
            })
            .run()
        })
    })
}

function getRandomAudioCut(duration:number):number{
    const totalLength = duration -2
    // 开头和结尾的20%长度
    const startEndLength = Math.floor(totalLength * 0.2);
    // 中间的60%长度
    const middleLength = Math.floor(totalLength * 0.6);
    let startTime = 0;
    const randomNum = Math.random();
    // 权重: 开头和结尾部分20%，中间部分80%
    if (randomNum < 0.1) {
        startTime = Math.random() * startEndLength;
    } else if (randomNum < 0.9) {
        startTime = startEndLength + (Math.random() * middleLength);
    } else {
        startTime = totalLength - startEndLength + (Math.random() * startEndLength);
    }
    return startTime
}
import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import { SimpleSongData, SongList } from "../types/song";
import { Context, h, Session } from "koishi"
import { group } from "console";
import { getBestMatch } from "../utils/fuzzyMatch";

interface GamingGroup{
    groupID:string,
    songID:number,
    songName:string,
    countdown:NodeJS.Timeout,
}

const songListUrl = 'https://bestdori.com/api/songs/all.7.json'
const songAssetUrl = 'https://bestdori.com/assets/jp/sound' //https://bestdori.com/assets/jp/sound/bgm[songID]_rip/bgm[songID].mp3
const songDataUrl = 'https://bestdori.com/api/songs' //https://bestdori.com/api/songs/[songID].json
let gamingGroups:GamingGroup[] = [] //正在进行猜曲的群组
let songList:{list:SongList,updateTime:number} = { list: undefined, updateTime: 0 } //所有歌曲的简略数据
let songIDs:number[] = [] //所有歌曲的ID

export async function getAllSongList(ctx:Context){
    const listJsonData = path.join(__dirname,'../assets/temp/songList.json')
    const now = Date.now()
    if(fs.existsSync(listJsonData)){
        const stat = fs.statSync(listJsonData)
        if(now - stat.birthtime.getDate() > 1000 * 60 * 60){
            songList.list = JSON.parse(fs.readFileSync(listJsonData,'utf-8'))
            songList.updateTime = now
            songIDs = Object.keys(songList.list).map(Number)
        }
    }
    else{
        songList.list = await ctx.http.get(songListUrl)
        fs.writeFileSync(listJsonData,JSON.stringify(songList.list),'utf-8')
        songList.updateTime = now
        songIDs = Object.keys(songList.list).map(Number)
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
    // const answerID = 242
    const answerID = getRandomSongID()
    console.log(`当前要猜的歌曲为: ID${answerID}:`+songList.list[answerID].musicTitle[0])
    gamingGroups.push({groupID:session.channelId, songID:answerID, songName:songList.list[answerID].musicTitle[0], countdown:undefined})
    const audiobuffer = await processedAudio(ctx,answerID,session.channelId)
    if(audiobuffer == undefined){
        session.sendQueued('audio is undefined')
        return
    }
    session.sendQueued('猜曲开始，请发送[。歌曲名]或[。歌曲ID]开始猜曲吧(英文的.也可以哦),时间限制为50s',500)
    session.sendQueued(h.audio(audiobuffer,'audio/mp3'))
    const index = gamingGroups.findIndex(value => value.groupID == session.channelId)
    const timeout = setTimeout(()=>endGussingSong(session,true),50000)
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

export function checkAnswer(session:Session){
    //检查是否是正在游戏的群成员触发的
    if(gamingGroups.some(value => value.groupID == session.channelId)){
        const index = gamingGroups.findIndex(value => value.groupID == session.channelId)
        const answer = session.content.slice(1)
        if(parseInt(answer)){
            const id = parseInt(answer)
            if(id == gamingGroups[index].songID){
                let messageList = []
                messageList.push(h('img',{src:getJacketUrl(gamingGroups[index].songID)}))
                messageList.push(h('at',{id:session.userId}) + ` 回答正确，答案是${gamingGroups[index].songName}`)
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
            const options:string[] = Object.values(songList.list).map((value)=> {
                if(value.musicTitle[0]){
                    return value.musicTitle[0]
                }
                else{
                    return undefined
                }
            }).filter((value)=>value != undefined)
            const bestMatch = getBestMatch(options,answer)
            console.log('bestMatch: '+ bestMatch)
            if(bestMatch == gamingGroups[index].songName){
                let messageList = []
                messageList.push(h('img',{src:getJacketUrl(gamingGroups[index].songID)}))
                messageList.push(h('at',{id:session.userId}) + ` 回答正确，答案是${gamingGroups[index].songName}`)
                messageList.push(` 回答正确，答案是${gamingGroups[index].songName}`)
                session.send(messageList)
                fastEndGussingSong(session.channelId)
            }
            else{
                session.send(`答案不是${bestMatch}哦`)
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
            if( songTilte != undefined && !songTilte.includes('ver') && !songTilte.includes('full')){
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
    const songAudio = await ctx.http.get(`${songAssetUrl}/bgm${idString}_rip/bgm${idString}.mp3`,{ responseType: 'arraybuffer' })
    const buffer = Buffer.from(songAudio)
    const filePath = path.join(__dirname,`../assets/songMp3/song${idString}.mp3`)
    const tempFilePath = path.join(__dirname,`../assets/temp/${groupID}.mp3`)
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
    // 随机生成的开始时间和结束时间
    let startTime = 0;
    // 随机数决定选择哪个区域
    const randomNum = Math.random();
    // 权重: 开头和结尾部分各20%，中间部分60%
    if (randomNum < 0.1) {
        // 选择开头的20%
        startTime = Math.random() * startEndLength;
    } else if (randomNum < 0.9) {
        // 选择中间的60%
        startTime = startEndLength + (Math.random() * middleLength);
    } else {
        // 选择结尾的20%
        startTime = totalLength - startEndLength + (Math.random() * startEndLength);
    }
    return startTime
}
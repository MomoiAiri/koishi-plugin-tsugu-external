import { Context, Schema, Session } from 'koishi'
import { checkAnswer, endGussingSong, getAllSongList, guessSongInit, startGuessingSong } from './games/guessSong'
import { config } from 'process'
import path from 'path'

export const name = 'tsugu-external'
export const tempAssetPath = path.join(__dirname,'../../../data/assets/temp')
export const songAssetPath = path.join(__dirname,'../../../data/assets/songMp3')

export interface Config {
  illustrate:string,
  useLocalStorage: boolean,
}

export const Config: Schema<Config> = Schema.object({
  useLocalStorage: Schema.boolean().default(false).description('是否采用本地存储，开启后响应速度会变快，但是更占用本地存储空间'),
  illustrate: Schema.string().default('').description('如果获取别名库时报错，则可以从https://raw.githubusercontent.com/Yamamoto-2/tsugu-bangdream-bot/master/backend/config/nickname_song.xlsx 处手动下载并放在koishi根目录的data/assets/temp文件夹中')
})
export let pluginConfig:Config = {useLocalStorage:false,illustrate:''}

export function apply(ctx: Context, config:Config) {
  pluginConfig = config
  guessSongInit(ctx)

  ctx.middleware((session,next)=>{
    if(session.content.startsWith('。')||session.content.startsWith('.')){
      checkAnswer(session)
    }
    return next();
  })

  ctx.command('猜歌曲')
  .action(async({session},_)=>{
    startGuessingSong(ctx,session)
  })

  ctx.command('结束猜曲')
  .action(async({session},_)=>{
    endGussingSong(session)
  })
}


import { Context, Schema, Session } from 'koishi'
import { checkAnswer, endGussingSong, getAllSongList, guessSongInit, startGuessingSong } from './games/guessSong'

export const name = 'tsugu-external'

export interface Config {}

export const Config: Schema<Config> = Schema.object({
  useLocalStorage: Schema.boolean().description('是否采用本地存储，开启后响应速度会变快，但是更占用本地存储空间').default(false),
})

export function apply(ctx: Context) {

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

import { songList } from "../games/guessSong"
import { NickNameTable } from "../types/song"

function calculateMatchWeight(option:string, key:string):number{
    let newOption = option.toLowerCase().replace(' ', '')
    const optionLength = newOption.length
    const newKey = key.toLowerCase().replace(' ', '')
    let sameCount = 0
    for(let i = 0; i < newKey.length; i++){
        if(newOption.includes(newKey[i])){
            sameCount++
            const index = newOption.indexOf(newKey[i])
            newOption = newOption.slice(index + 1)
        }
    }
    if(optionLength < newKey.length && sameCount != 0){
        return sameCount / newKey.length
    }
    return sameCount / optionLength
}

//获取最匹配的选项
export function getBestMatch(options:string[], key:string):string[]{
    let bestMatch = ''
    let highestWeight = 0
    const newoptions = options.filter(option=> option.toLowerCase().includes(key.toLowerCase()))
    if(newoptions.length == 0){
        for(let i = 0; i < options.length; i++){
            const weight = calculateMatchWeight(options[i], key)
            if(weight > highestWeight){
                highestWeight = weight
                bestMatch = options[i]
            }
        }
    }
    else{
        return newoptions
    }
    return [bestMatch]
}

export function matchSong(options:NickNameTable[], key:string):string[]{
    let matchResult:number[] = []
    for(let i = 0; i < options.length; i++){
        if(options[i].nickNames.includes(key)){
            matchResult.push(options[i].songID)
        }
    }
    if(matchResult.length == 0 || matchResult.length > 10){
        const newoptions:string[] = Object.values(songList.list).map((value)=> {
            if(value.musicTitle[0]){
                return value.musicTitle[0]
            }
            else{
                return undefined
            }
        }).filter((value)=>value != undefined)
        return getBestMatch(newoptions, key)
    }
    else{
        let result:string[] = []
        for(let i = 0; i < matchResult.length; i++){
            result.push(songList.list[matchResult[i]].musicTitle[0])
        }
        return result
    }
}


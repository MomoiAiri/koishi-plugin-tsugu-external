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
export function getBestMatch(options:string[], key:string):string{
    let bestMatch = ''
    let highestWeight = 0
    for(let i = 0; i < options.length; i++){
        const weight = calculateMatchWeight(options[i], key)
        if(weight > highestWeight){
            highestWeight = weight
            bestMatch = options[i]
        }
    
    }
    return bestMatch
}
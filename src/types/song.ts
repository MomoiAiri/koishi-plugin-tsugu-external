export interface SongList{
    [key:number]:SimpleSongData
}
export interface SimpleSongData {
    tag:         string;
    bandId:      number;
    jacketImage: string[];
    musicTitle:  string[];
    publishedAt: string[];
    closedAt:    string[];
    difficulty:  { [key: string]: Difficulty };
    length:      number;
    notes:       { [key: string]: number };
    bpm:         { [key: string]: BPM[] };
}

interface BPM {
    bpm:   number;
    start: number;
    end:   number;
}
interface Difficulty {
    playLevel:    number;
    publishedAt?: string[];
}

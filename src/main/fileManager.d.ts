export declare class FileManager {
    private basePath;
    constructor(basePath: string);
    readFile(filePath: string): Promise<string>;
    writeFile(filePath: string, content: string): Promise<boolean>;
    listFiles(dirPath: string): Promise<{
        name: string;
        path: string;
        isDirectory: boolean;
        size: number;
    }[]>;
    parseIni(content: string): Record<string, any>;
    stringifyIni(data: Record<string, any>): string;
    readIni(filePath: string): Promise<Record<string, any>>;
    writeIni(filePath: string, data: Record<string, any>): Promise<boolean>;
    readJson<T = any>(filePath: string): Promise<T>;
    writeJson(filePath: string, data: any): Promise<boolean>;
    fileExists(filePath: string): Promise<boolean>;
    ensureDir(dirPath: string): Promise<void>;
}
//# sourceMappingURL=fileManager.d.ts.map
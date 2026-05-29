import fs from 'fs-extra';
import path from 'path';
import ini from 'ini';

export class FileManager {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async readFile(filePath: string): Promise<string> {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<boolean> {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
    await fs.writeFile(fullPath, content, 'utf-8');
    return true;
  }

  async listFiles(dirPath: string): Promise<any[]> {
    const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(this.basePath, dirPath);
    await fs.ensureDir(fullPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(fullPath, entry.name),
      isDirectory: entry.isDirectory(),
      size: entry.isFile() ? fs.statSync(path.join(fullPath, entry.name)).size : 0,
    }));
  }

  parseIni(content: string): Record<string, any> {
    return ini.parse(content);
  }

  stringifyIni(data: Record<string, any>): string {
    return ini.stringify(data);
  }

  async readIni(filePath: string): Promise<Record<string, any>> {
    const content = await this.readFile(filePath);
    return this.parseIni(content);
  }

  async writeIni(filePath: string, data: Record<string, any>): Promise<boolean> {
    const content = this.stringifyIni(data);
    return this.writeFile(filePath, content);
  }

  async readJson(filePath: string): Promise<any> {
    const content = await this.readFile(filePath);
    return JSON.parse(content);
  }

  async writeJson(filePath: string, data: any): Promise<boolean> {
    const content = JSON.stringify(data, null, 2);
    return this.writeFile(filePath, content);
  }

  async fileExists(filePath: string): Promise<boolean> {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.basePath, filePath);
    return fs.pathExists(fullPath);
  }

  async ensureDir(dirPath: string): Promise<void> {
    const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(this.basePath, dirPath);
    await fs.ensureDir(fullPath);
  }
}

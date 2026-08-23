import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { OpenFolderRequest, OpenFolderResponse, HealthResponse } from '@doc-tool/shared';

@Injectable()
export class SystemService {
  getHealth(): HealthResponse {
    return {
      status: 'healthy',
      system: os.type(),
      release: os.release(),
      node_version: process.version,
      working_directory: process.cwd(),
    };
  }

  async openSystemFolder(request: OpenFolderRequest): Promise<OpenFolderResponse> {
    const rawPath = request.path?.trim();
    if (!rawPath) {
      throw new NotFoundException('路径不能为空');
    }

    let targetPath = path.resolve(rawPath);

    if (!fs.existsSync(targetPath)) {
      const altWorkspacePath = path.resolve(process.cwd(), '..', '..', rawPath);
      const altLocalPath = path.resolve(process.cwd(), rawPath);

      if (fs.existsSync(altWorkspacePath)) {
        targetPath = altWorkspacePath;
      } else if (fs.existsSync(altLocalPath)) {
        targetPath = altLocalPath;
      } else {
        const parent = path.dirname(targetPath);
        if (fs.existsSync(parent)) {
          targetPath = parent;
        } else {
          throw new NotFoundException(`目标路径不存在: ${rawPath}`);
        }
      }
    }

    try {
      if (process.platform === 'win32') {
        const isFile = fs.statSync(targetPath).isFile();
        if (isFile) {
          spawn('explorer.exe', [`/select,${targetPath}`], { detached: true, stdio: 'ignore' });
        } else {
          spawn('explorer.exe', [targetPath], { detached: true, stdio: 'ignore' });
        }
      } else if (process.platform === 'darwin') {
        const isFile = fs.statSync(targetPath).isFile();
        if (isFile) {
          spawn('open', ['-R', targetPath], { detached: true, stdio: 'ignore' });
        } else {
          spawn('open', [targetPath], { detached: true, stdio: 'ignore' });
        }
      } else {
        const isDir = fs.statSync(targetPath).isDirectory();
        const dirToOpen = isDir ? targetPath : path.dirname(targetPath);
        spawn('xdg-open', [dirToOpen], { detached: true, stdio: 'ignore' });
      }

      return {
        success: true,
        message: `已在系统文件管理器中打开: ${targetPath}`,
        path: targetPath,
      };
    } catch (err: any) {
      throw new InternalServerErrorException(`唤起系统文件管理器失败: ${err.message}`);
    }
  }
}

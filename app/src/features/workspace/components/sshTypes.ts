// SSH 对象前端配置类型。
// Created on 2026-09-17
// @author: https://github.com/Linmoqian

export type SshAuthMethod = 'key' | 'password';

export type SshObject = {
  id: string;
  name: string;
  host: string;
  port: string;
  username: string;
  authMethod: SshAuthMethod;
  keyPath: string;
  password: string;
};

export type SshObjectField = Exclude<keyof SshObject, 'id'>;

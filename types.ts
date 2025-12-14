export interface AudioData {
  buffer: AudioBuffer;
  source: AudioBufferSourceNode;
}

export interface StreamConfig {
  sampleRate: number;
}

export enum SystemState {
  IDLE = 'STANDBY',
  LISTENING = 'LISTENING',
  PROCESSING = 'PROCESSING',
  SPEAKING = 'SPEAKING',
  OFFLINE = 'OFFLINE'
}

export interface LogEntry {
  timestamp: string;
  source: 'USER' | 'JARVIS' | 'SYSTEM';
  message: string;
}

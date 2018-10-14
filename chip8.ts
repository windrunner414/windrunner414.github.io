// import {log} from './log'; // don't import

// declare let window: any;

const log = {
    error: function (text: string) {
        console.error(text);
    },
    info: function (text: string) {
        console.info(text);
    },
    warn: function (text: string) {
        console.warn(text);
    }
};

class chip8
{
    opcode: number;
    memory: Uint8Array;
    register: Uint8Array;
    I: number; // index register
    pc: number; // program counter
    gfx: Uint8Array;
    delayTimer: number;
    soundTimer: number;
    stack: Uint16Array;
    sp: number;
    key: Uint8Array;
    keyMap: object;

    playingSound: boolean;
    audioContext: AudioContext;
    gain: GainNode;
    oscillator: OscillatorNode;

    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    color: Array<string>;

    speed: number;
    loopTimer: number;

    constructor(canvas: HTMLCanvasElement, romUrl: string, speed: number) {
        this.memory = new Uint8Array(4096);
        this.register = new Uint8Array(16);
        this.gfx = new Uint8Array(64 * 32);
        this.stack = new Uint16Array(16);
        this.key = new Uint8Array(16);

        this.opcode = 0;
        this.I = 0;
        this.pc = 0x200;
        this.delayTimer = 0;
        this.soundTimer = 0;
        this.sp = 0;

        this.playingSound = false;
        let contextClass = (<any>window).AudioContext || (<any>window).webkitAudioContext;
        this.audioContext = new contextClass();
        this.gain = this.audioContext.createGain();
        this.gain.connect(this.audioContext.destination);
        this.oscillator = null;

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.scale(this.canvas.clientWidth / 64, this.canvas.clientHeight / 32);
        this.color = ['white', 'black'];

        this.speed = speed;

        this.keyMap = {
            '1': 0x1, '2': 0x2, '3': 0x3, '4': 0xc,
            'q': 0x4, 'w': 0x5, 'e': 0x6, 'r': 0xd,
            'a': 0x7, 's': 0x8, 'd': 0x9, 'f': 0xe,
            'z': 0xa, 'x': 0x0, 'c': 0xb, 'v': 0xf
        };

        let fontSet = new Uint8Array([
            0xF0, 0x90, 0x90, 0x90, 0xF0, //0
            0x20, 0x60, 0x20, 0x20, 0x70, //1
            0xF0, 0x10, 0xF0, 0x80, 0xF0, //2
            0xF0, 0x10, 0xF0, 0x10, 0xF0, //3
            0x90, 0x90, 0xF0, 0x10, 0x10, //4
            0xF0, 0x80, 0xF0, 0x10, 0xF0, //5
            0xF0, 0x80, 0xF0, 0x90, 0xF0, //6
            0xF0, 0x10, 0x20, 0x40, 0x40, //7
            0xF0, 0x90, 0xF0, 0x90, 0xF0, //8
            0xF0, 0x90, 0xF0, 0x10, 0xF0, //9
            0xF0, 0x90, 0xF0, 0x90, 0x90, //A
            0xE0, 0x90, 0xE0, 0x90, 0xE0, //B
            0xF0, 0x80, 0x80, 0x80, 0xF0, //C
            0xE0, 0x90, 0x90, 0x90, 0xE0, //D
            0xF0, 0x80, 0xF0, 0x80, 0xF0, //E
            0xF0, 0x80, 0xF0, 0x80, 0x80  //F
        ]);
        this.copyMemory(fontSet, 0);

        fetch(romUrl).then(response => response.blob())
            .then(blob => {
                let reader = new FileReader();
                reader.readAsArrayBuffer(blob);
                reader.onload = () => {
                    let rom = new Uint8Array(<ArrayBuffer>reader.result);

                    if (rom.length > (4096 - 512)) {
                        log.error('Rom too big');
                        return;
                    }

                    this.copyMemory(rom, 0x200);
                    this.loop();
                };
            })
            .catch(e => log.error(e));

        document.onkeydown = (e) => {
            if (e.key in this.keyMap) {
                this.key[this.keyMap[e.key]] = 1;
            }
        };

        document.onkeyup = (e) => {
            if (e.key in this.keyMap) {
                this.key[this.keyMap[e.key]] = 0;
            }
        };
    }

    copyMemory(src: Uint8Array, start: number = 0): void {
        for (let i = 0; i < src.length; ++i) {
            this.memory[i + start] = src[i];
        }
    }

    readOPCode(): number {
        return this.memory[this.pc] << 8 | this.memory[this.pc + 1];
    }

    execOPCode(opcode: number): boolean {
        switch (opcode & 0xf000) {
            case 0x0000:
                switch (opcode & 0x000f) {
                    case 0x0000:
                        this.clearScreen();
                        this.pc += 2;
                    break;

                    case 0x000e:
                        this.pc = this.stack[--this.sp] + 2;
                    break;

                    default:
                        log.error('Unknown opcode');
                        return false;
                }
            break;
            
            case 0x1000:
                this.pc = opcode & 0x0fff;
            break;

            case 0x2000:
                if (!this.pushToStack()) {
                    return false;
                }

                this.pc = opcode & 0x0fff;
            break;

            case 0x3000:
                if (this.register[(opcode & 0x0f00) >> 8] === (opcode & 0x00ff)) {
                    this.pc += 4;
                } else {
                    this.pc += 2;
                }
            break;

            case 0x4000:
                if (this.register[(opcode & 0x0f00) >> 8] !== (opcode & 0x00ff)) {
                    this.pc += 4;
                } else {
                    this.pc += 2;
                }
            break;

            case 0x5000:
                if (this.register[(opcode & 0x0f00) >> 8] === this.register[(opcode & 0x00f0) >> 4]) {
                    this.pc += 4;
                } else {
                    this.pc += 2;
                }
            break;

            case 0x6000:
                this.register[(opcode & 0x0f00) >> 8] = opcode & 0x00ff;
                this.pc += 2;
            break;

            case 0x7000:
                this.register[(opcode & 0x0f00) >> 8] += opcode & 0x00ff;
                this.pc += 2;
            break;

            case 0x8000:
                switch (opcode & 0x000f) {
                    case 0x0000:
                        this.register[(opcode & 0x0f00) >> 8] = this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                    break;

                    case 0x0001:
                        this.register[(opcode & 0x0f00) >> 8] = this.register[(opcode & 0x0f00) >> 8] | this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                    break;

                    case 0x0002:
                        this.register[(opcode & 0x0f00) >> 8] = this.register[(opcode & 0x0f00) >> 8] & this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                    break;

                    case 0x0003:
                        this.register[(opcode & 0x0f00) >> 8] = this.register[(opcode & 0x0f00) >> 8] ^ this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                    break;

                    case 0x0004:
                        if (this.register[(opcode & 0x00f0) >> 4] > (0xff - this.register[(opcode & 0x0f00) >> 8])) {
                            this.register[0xf] = 1;
                        } else {
                            this.register[0xf] = 0;
                        }

                        this.register[(opcode & 0x0f00) >> 8] += this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                    break;

                    case 0x0005:
                        if (this.register[(opcode & 0x00f0) >> 4] > this.register[(opcode & 0x0f00) >> 8]) {
                            this.register[0xf] = 0;
                        } else {
                            this.register[0xf] = 1;
                        }

                        this.register[(opcode & 0x0f00) >> 8] -= this.register[(opcode & 0x00f0) >> 4];
                        this.pc += 2;
                    break;

                    case 0x0006:
                        this.register[0xf] = this.register[(opcode & 0x0f00) >> 8] & 0x1;
                        this.register[(opcode & 0x0f00) >> 8] >>= 1;
                        this.pc += 2;
                    break;

                    case 0x0007:
                        if (this.register[(opcode & 0x0f00) >> 8] > this.register[(opcode & 0x00f0) >> 4]) {
                            this.register[0xf] = 0;
                        } else {
                            this.register[0xf] = 1;
                        }

                        this.register[(opcode & 0x0f00) >> 8] = this.register[(opcode & 0x00f0) >> 4] - this.register[(opcode & 0x0f00) >> 8];
                        this.pc += 2;
                    break;

                    case 0x000e:
                        this.register[0xf] = this.register[(opcode & 0x0f00) >> 8] >> 7;
                        this.register[(opcode & 0x0f00) >> 8] <<= 1;
                        this.pc += 2;
                    break;

                    default:
                        log.error('Unknown opcode');
                        return false;
                }
            break;

            case 0x9000:
                if (this.register[(opcode & 0x0f00) >> 8] !== this.register[(opcode & 0x00f0) >> 4]) {
                    this.pc += 4;
                } else {
                    this.pc += 2;
                }
            break;

            case 0xa000:
                this.I = opcode & 0x0fff;
                this.pc += 2;
            break;

            case 0xb000:
                this.pc = (opcode & 0x0fff) + this.register[0];
            break;

            case 0xc000:
                this.register[(opcode & 0x0f00) >> 8] = (Math.floor(Math.random() * 256)) & (opcode & 0x00ff);
                this.pc += 2;
            break;

            case 0xd000:
                let x = this.register[(opcode & 0x0f00) >> 8];
                let y = this.register[(opcode & 0x00f0) >> 4];
                let n = opcode & 0x000f;

                this.register[0xf] = 0;

                for (let line = 0; line < n; ++line) {
                    let pixel = this.memory[this.I + line];

                    for (let xp = 0; xp < 8; ++xp) {
                        if (pixel & (0x80 >> xp)) {
                            let index = (y + line) * 64 + xp + x;

                            if (this.gfx[index] === 1) {
                                this.register[0xf] = 1;
                                this.gfx[index] = 0;
                            } else {
                                this.gfx[index] = 1;
                            }

                            this.ctx.fillStyle = this.color[this.gfx[index]];
                            this.ctx.fillRect(x + xp, y + line, 1, 1);
                        }
                    }
                }

                this.ctx.fill();

                this.pc += 2;
            break;

            case 0xe000:
                switch (opcode & 0x00ff) {
                    case 0x009e:
                        if (this.key[this.register[(opcode & 0x0f00) >> 8]] === 1) {
                            this.pc += 4;
                        } else {
                            this.pc += 2;
                        }
                    break;

                    case 0x00a1:
                        if (this.key[this.register[(opcode & 0x0f00) >> 8]] === 0) {
                            this.pc += 4;
                        } else {
                            this.pc += 2;
                        }
                    break;

                    default:
                        log.error('Unknown opcode');
                        return false;
                }
            break;
                
            case 0xf000:
                out:
                switch (opcode & 0x00ff) {
                    case 0x0007:
                        this.register[(opcode & 0x0f00) >> 8] = this.delayTimer;
                        this.pc += 2;
                    break;

                    case 0x000a:
                        for (let i in this.key) {
                            if (this.key[i] === 1) {
                                this.register[(opcode & 0x0f00) >> 8] = parseInt(i);
                                this.pc += 2;
                                break out;
                            }
                        }
                    break;

                    case 0x0015:
                        this.delayTimer = this.register[(opcode & 0x0f00) >> 8];
                        this.pc += 2;
                    break;

                    case 0x0018:
                        this.soundTimer = this.register[(opcode & 0x0f00) >> 8];
                        this.pc += 2;
                    break;

                    case 0x001e:
                        this.I += this.register[(opcode & 0x0f00) >> 8];
                        this.pc += 2;
                    break;

                    case 0x0029:
                        this.I = this.register[(opcode & 0x0f00) >> 8] * 5;
                        this.pc += 2;
                    break;

                    case 0x0033:
                        this.memory[this.I] = this.register[(opcode & 0x0f00) >> 8] / 100;
                        this.memory[this.I + 1] = (this.register[(opcode & 0x0f00) >> 8] / 10) % 10;
                        this.memory[this.I + 2] = (this.register[(opcode & 0x0f00) >> 8] % 100) % 10;
                        this.pc += 2;
                    break;

                    case 0x0055:
                        for (let i = 0; i <= (opcode & 0x0f00) >> 8; ++i) {
                            this.memory[this.I + i] = this.register[i];
                        }

                        this.pc += 2;
                    break;

                    case 0x0065:
                        for (let i = 0; i <= (opcode & 0x0f00) >> 8; ++i) {
                            this.register[i] = this.memory[this.I + i];
                        }

                        this.pc += 2;
                    break;

                    default:
                        log.error('Unknown opcode');
                        return false;
                }
            break;

            default:
                log.error('Unknown opcode');
                return false;
        }

        return true;
    }

    pushToStack(): boolean {
        if (this.sp < this.stack.length) {
            this.stack[this.sp++] = this.pc;
            return true;
        } else {
            log.error('Stack overflow');
            return false;
        }
    }

    clearScreen(): void {
        this.gfx.fill(0);
        this.ctx.fillStyle = this.color[0];
        this.ctx.fillRect(0, 0, 64, 32);
    }

    playSound(): void {
        if (this.playingSound || this.oscillator) {
            return;
        }

        this.playingSound = true;
        this.oscillator = this.audioContext.createOscillator();
        this.oscillator.frequency.value = 440;
        this.oscillator.type = 'triangle';
        this.oscillator.connect(this.gain);
        this.oscillator.start(0);
    }

    stopSound(): void {
        if (this.playingSound && this.oscillator) {
            this.oscillator.stop(0);
            this.oscillator.disconnect(0);
            this.oscillator = null;
        }
    }

    cycle(): boolean {
        if (this.pc + 1 >= this.memory.length) {
            return false;
        }

        this.opcode = this.readOPCode();

        if (!this.execOPCode(this.opcode)) {
            log.error('OPCode ' + this.opcode.toString());
            return false;
        }

        if (this.delayTimer > 0) {
            --this.delayTimer;
        }

        if (this.soundTimer > 0) {
            --this.soundTimer;

            if (this.soundTimer === 0) {
                this.stopSound();
            } else {
                this.playSound();
            }
        }

        return true;
    }

    loop(): void {
        this.loopTimer = setInterval(() => {
            if (!this.cycle()) {
                clearInterval(this.loopTimer);
                log.info('finish');
            }
        }, 1000 / (60 * this.speed));
    }

    destroy(): void {
        clearInterval(this.loopTimer);
        this.clearScreen();
    }
}
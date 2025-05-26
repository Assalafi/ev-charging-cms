// This file provides necessary polyfills for libraries that expect Node.js APIs
import { Buffer } from 'buffer';
import process from 'process';

window.Buffer = Buffer;
window.process = process;

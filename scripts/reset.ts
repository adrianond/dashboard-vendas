import { rmSync } from "node:fs";
import path from "node:path";
import { env } from "../src/lib/env";

// Apaga o banco (e os arquivos do modo WAL). Usado por "npm run db:reset" antes de migrar e popular.
const arquivo = path.resolve(env.DATABASE_PATH);
for (const sufixo of ["", "-wal", "-shm"]) {
  rmSync(`${arquivo}${sufixo}`, { force: true });
}
console.log(`Banco apagado: ${arquivo}`);

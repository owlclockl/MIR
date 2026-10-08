/* Конфигурация сборки встроенного редактора Azgaar (см. fmg-offline.mjs).

   Берём конфиг самого Azgaar — плагины, русскую локаль, отключение аналитики
   электронной сборки — и меняем только вывод: один классический скрипт без
   динамических чанков, потому что внутри mir.html скрипты грузить неоткуда. */

import { fileURLToPath } from 'node:url';
import base from '../../vendor/azgaar-fantasy-map-generator/vite.config.ts';

export default (env) => {
  const config = base({ ...env, mode: 'electron' });
  return {
    ...config,
    root: fileURLToPath(new URL('../../vendor/azgaar-fantasy-map-generator/src', import.meta.url)),
    base: './',
    build: {
      ...config.build,
      rollupOptions: {
        output: {
          format: 'iife',
          inlineDynamicImports: true,
          entryFileNames: 'app.js',
        },
      },
    },
  };
};

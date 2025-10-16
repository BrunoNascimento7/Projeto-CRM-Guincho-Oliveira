// craco.config.js
module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      console.log(">>> USANDO CONFIGURAÇÃO RADICAL DO CRACO: MINIMIZAÇÃO DESATIVADA <<<");

      // Apenas para o build de produção
      if (env === 'production') {
        // Esta é a ordem direta para desativar toda a otimização de "encolhimento"
        webpackConfig.optimization.minimize = false;
      }

      // Retorna a configuração modificada
      return webpackConfig;
    },
  },
};
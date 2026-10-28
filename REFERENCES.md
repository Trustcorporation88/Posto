# Referências do Sobra

O app foi implementado em Expo/React Native com TypeScript, com persistência exclusivamente local. As dependências são instaladas pelo gerenciador de pacotes e mantêm suas licenças nos respectivos pacotes.

## Bibliotecas de apoio

Papa Parse: https://github.com/mholt/PapaParse . Licença MIT. Usado para interpretar CSV com cabeçalhos, delimitadores, aspas e quebras de linha. A serialização financeira mantém um formato brasileiro explícito e proteção contra fórmulas em planilhas.

react-native-svg: https://github.com/software-mansion/react-native-svg . Licença MIT. Usado para renderizar gráficos quantitativos equivalentes em web e nativo.

AsyncStorage: https://github.com/react-native-async-storage/async-storage . Adaptador de armazenamento local no dispositivo nativo, já incluído no starter.

## Inspirações sem cópia de código

Actual Budget: https://github.com/actualbudget/actual . Referência da abordagem local-first, da separação entre domínio e interface e de adaptadores de persistência. Nenhum núcleo de sincronização, servidor ou código-fonte foi copiado. A raiz declara MIT, mas metadados de pacotes podem divergir; eventuais reutilizações futuras exigem verificar cada arquivo/pacote.

Instagram Geração FP&A: https://www.instagram.com/p/DeUU8tSlk2t/ e https://www.instagram.com/p/DehuWDjFsJ_/ . As legendas inspiraram foco no que sobra e clareza de percentuais. Não foram copiadas imagens, identidade de terceiros nem a estrutura visual dos carrosséis. Os temas empresariais não ampliam o escopo pessoal do Sobra.

A identidade Sobra e o ícone foram criados para este projeto. As fontes Manrope e DM Sans são empacotadas localmente pelos pacotes Expo Google Fonts; não há envio de dados financeiros para serviços de fontes.

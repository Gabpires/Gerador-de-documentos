# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Equipe administrativa e corretores da Paraíba Imóveis que precisam criar, revisar, emitir, imprimir, armazenar e consultar documentos ligados à locação e à gestão imobiliária.

## Product Purpose

Viabilizar a criação, a revisão, a emissão, a impressão e o armazenamento de recibos, declarações, termos, contratos e documentos livres da imobiliária. O sucesso depende de a equipe produzir documentos corretos e legíveis sem tornar o fluxo de dados difícil de entender.

## Positioning

Na fase atual de validação, o gerador opera localmente: os registros ficam no navegador e não há sincronização externa. Emissões com modelos dinâmicos preservam o snapshot do modelo e dos valores usados, de modo que mudanças posteriores não alterem o documento emitido.

## Operating Context

O trabalho acontece no navegador durante rotinas de locação e administração imobiliária. O operador preenche dados de pessoas, imóveis e contratos; pode reutilizar cadastros, consultar histórico e dossiês, administrar modelos e preparar o documento para impressão A4.

## Capabilities and Constraints

- Aplicação web estática, compatível com navegadores modernos, sem dependência de back-end para os registros.
- Dados operacionais são mantidos localmente no navegador; modelos HTML/JSON são atendidos pelo servidor local do projeto.
- A chave de armazenamento, o esquema de dados e a numeração dos documentos exigem migração e testes explícitos antes de qualquer alteração.
- A fidelidade da prévia e da impressão A4 é parte do produto.
- O conteúdo jurídico dos documentos só pode mudar com validação do responsável.

## Brand Commitments

Gerador de documentos da Paraíba Imóveis. A interface deve ser profissional, clara e confiável para a operação imobiliária.

## Evidence on Hand

O projeto contém modelos de recibo, declaração, termo, contrato e documento livre em `resources/templates/`; testes automatizados para emissão, validação, histórico, responsividade e impressão; e uma prévia A4 integrada ao fluxo de emissão. Não há evidência para inventar depoimentos, clientes, métricas, preços ou integrações externas.

## Product Principles

- Priorizar clareza e prevenção de erros antes da emissão.
- Tornar as tarefas recorrentes rápidas e fáceis de aprender para administrativos e corretores.
- Manter cada emissão rastreável dentro do armazenamento local da aplicação nesta fase de validação.
- Garantir responsividade e acessibilidade em cada etapa do fluxo.
- Preservar a fidelidade entre formulário, prévia e impressão A4.

## Accessibility & Inclusion

A aplicação deve funcionar bem com leitores de tela e manter uma interface que não seja confusa ou difícil de usar. Fluxos, rótulos, estados de erro, foco e confirmações devem permitir que operadores concluam a emissão com clareza.

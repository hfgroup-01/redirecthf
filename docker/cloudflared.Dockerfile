# Túnel Cloudflare do HF rodando como serviço no EasyPanel.
#
# A imagem oficial do cloudflared é distroless: não tem /bin/sh. O EasyPanel envolve o
# campo "Comando" em `/bin/sh -c "..."`, então o container morria antes de existir e sem
# escrever log (status ciclando em Preparing/Ready, bolinha amarela). Aqui os argumentos
# entram no ENTRYPOINT e o campo Comando do painel fica VAZIO.
FROM cloudflare/cloudflared:latest

# Definir ENTRYPOINT zera o CMD ["version"] que vem da imagem base — senão "version"
# chegaria como argumento de `tunnel run`, que o leria como nome de túnel.
ENTRYPOINT ["cloudflared", "--no-autoupdate", "tunnel", "--config", "/etc/cloudflared/config.yml", "run"]

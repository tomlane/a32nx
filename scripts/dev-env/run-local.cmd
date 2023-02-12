@echo off

rem This is a script to use a locally built docker image to run the tests

set image="sha256:12d198d638db031fd3599c225a3ccd4c2bda487593caf1ef940416465c81d6c5"

docker image inspect %image% 1> nul || docker system prune --filter label=flybywiresim=true -f
docker run --rm -it -v "%cd%:/external" %image% %*

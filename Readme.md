Mako.js
=======

Mako.js is a JavaScript implementation of [Mako](https://github.com/JohnEarnest/Mako), a virtual game console. An interactive gallery of Mako programs can be found [here](http://johnearnest.github.io/Mako.js/).

Specifying a `rom` argument to the gallery URL can link to a specific Mako rom:

	http://johnearnest.github.io/Mako.js/?rom=Yar

Command-line (`CO` IO only) Mako programs can be run locally with [Node.js](http://http://nodejs.org):

	$ node MakoCLI.js roms/testcli.rom
	Hello!
	Please enter some text: For Example...
	You entered 'For Example...'
	Have a nice day.
	$

Note that while character input from `stdin` does not work in the current release version of Node (at time of writing v0.10.31) it does work with v0.11.13.

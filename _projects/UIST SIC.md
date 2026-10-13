---
layout: page
title: UltraBat - UIST SIC
description: An Interactive 3D Side-Scrolling Game using Ultrasound Levitation
img: assets/img/bat1.png
importance: 3
category: work
---

We presented our project, UltraBat, at the 2022 UIST SIC on Halloween. UltraBat is an interactive 3D arcade game that challenges players to guide a bat through a series of wooden blocks, avoiding obstacles to reach the destination. Using a joystick, players can adjust the heading direction to control the bat's jumping movement. The distance and height of each jump are determined by the duration of joystick input—how long it is held and when it is released. The game requires players to exhibit precise control to navigate through obstacles and prevent the bat from falling.

<div class="mb-2">
    <iframe width="100%" height="400" src="https://www.youtube.com/embed/TdXyQqirVXk" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

Our device is constructed of 3 parts: the bottom terrain, the middle levitation space, and the obstacles on top. Acting as the system's brain, the computer directly manipulates ultrasound wave patterns to control the movement of the bat. This process involves mapping the jumping trajectory to the levitation software, allowing for the adjustment of initial velocity and gravitational force (g force) to modify the path. In addition to controlling the character's movement, the computer also manages the movement of the levers, which involves sending signals via UART to a Mega 2560 controller board. This board then transmits the signals to the PCB, which contains drivers that pass the signals to the stepper motors. The motors are connected to a cam structure that converts rotary motion to linear motion, thereby creating a lever system that shifts up and down.

<div class="row justify-content-sm-center">
    <div class="col-sm-4 mt-3 mt-md-0">
        {% include figure.html path="assets/img/bat2.png" title="bat2" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm-8 mt-3 mt-md-0">
        {% include figure.html path="assets/img/bat3.jpg" title="bat3" class="img-fluid rounded z-depth-1" %}
    </div>
</div>

<div class="row justify-content-sm-center">
    <div class="col-sm-5 mt-3 mt-md-0">
        {% include figure.html path="assets/img/bat4.png" title="bat4" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm-4 mt-3 mt-md-0">
        {% include figure.html path="assets/img/bat5.png" title="bat5" class="img-fluid rounded z-depth-1" %}
    </div>
    <div class="col-sm-3 mt-3 mt-md-0">
        {% include figure.html path="assets/img/bat6.png" title="bat6" class="img-fluid rounded z-depth-1" %}
    </div>
</div>

import type { StaticImageData } from "next/image";
import dof1 from "./media/projects/4dof1.jpg";
import dof2 from "./media/projects/4dof2.jpg";
import bat1 from "./media/projects/bat1.jpg";
import bat2 from "./media/projects/bat2.jpg";
import bat3 from "./media/projects/bat3.jpg";
import bat4 from "./media/projects/bat4.jpg";
import bat5 from "./media/projects/bat5.jpg";
import bat6 from "./media/projects/bat6.jpg";
import car from "./media/projects/car.jpg";
import darkEcho from "./media/projects/darkecho.jpg";
import echoCaveWave from "./media/projects/echocavewave.jpg";
import echoFirefly from "./media/projects/echooutdoorfirefly.jpg";
import echoRed from "./media/projects/echooutdoorred.jpg";
import echoThumb from "./media/projects/echothumbnail.jpg";
import evil from "./media/projects/evil.jpg";
import hologram2 from "./media/projects/hologram2.jpg";
import hologram3 from "./media/projects/hologram3.jpg";
import ld21a from "./media/projects/lightdance2021-1.jpg";
import ld21b from "./media/projects/lightdance2021-2.jpg";
import ld21c from "./media/projects/lightdance2021-3.jpg";
import ld22a from "./media/projects/lightdance2022-1.jpg";
import ld22b from "./media/projects/lightdance2022-2.jpg";
import ld22c from "./media/projects/lightdance2022-3.jpg";
import ld22e from "./media/projects/lightdance2022-5.jpg";
import ld22f from "./media/projects/lightdance2022-6.jpg";
import ld22g from "./media/projects/lightdance2022-7.jpg";
import ld22h from "./media/projects/lightdance2022-8.jpg";
import ld22i from "./media/projects/lightdance2022-9.jpg";
import maker1 from "./media/projects/makerspace1.jpg";
import maker2 from "./media/projects/makerspace2.jpg";
import maker3 from "./media/projects/makerspace3.jpg";
import maker4 from "./media/projects/makerspace4.jpg";
import mrRoom0 from "./media/projects/mrroom0.jpg";
import mrRoom1 from "./media/projects/mrroom1.jpg";

/** A picture, or a YouTube video by its id. */
export type ProjectMedia =
  | { kind: "image"; image: StaticImageData; caption?: string }
  | { kind: "video"; youtube: string; caption?: string };

/** A paragraph of the write-up, or a run of pictures beside it. The order is
 *  the order the archived page told it in, and the spread keeps it. */
export type ProjectBlock = string | ProjectMedia[];

export type Project = {
  slug: string;
  title: string;
  /** The line under the reel, and the dek under the title in the spread. */
  description: string;
  /** The picture on the reel; the spread opens on it. */
  cover: StaticImageData;
  /** Paragraphs ([label](https://url) becomes a link) and media, in order. */
  blocks: ProjectBlock[];
};

const img = (image: StaticImageData, caption?: string): ProjectMedia => ({
  kind: "image",
  image,
  caption,
});
const yt = (youtube: string, caption?: string): ProjectMedia => ({
  kind: "video",
  youtube,
  caption,
});

// Brought over from the old site's _projects/, in the order it listed them.
export const projects: Project[] = [
  {
    slug: "mr-room",
    title: "MR Room",
    description: "A digital twin of my apartment",
    cover: mrRoom0,
    blocks: [
      "During my time in Ithaca, waking up to the sunlight filtering through my window and catching glimpses of the hillside forest has become a cherished memory I wish to preserve. Knowing I would have to leave this town in a week, I decided to create a digital replica of my room, a place I could revisit at any time.",
      [yt("MsHBaNtZMZg")],
      "To build the space, I came across an app called Magicplan, which enabled me to gauge the dimensions of my apartment using my smartphone camera. With the floor plan and a 3D model of the apartment walls generated, I proceeded to create 3D models of other objects, refining measurements along the way.",
      [yt("D-BLS4TqIyo")],
      "The only task remaining was to import this 3D model into Unity. I utilized a VR scene I had set up, incorporating interactive objects with the Unity XR Interaction Toolkit. After some calibration, I can now navigate the virtual environment without colliding with walls and have a digital version of my apartment accessible from anywhere.",
      [img(mrRoom1)],
    ],
  },
  {
    slug: "light-dance-2022",
    title: "Light Dance 2022",
    description: "Bringing Light Dance to life from a brand new perspective",
    cover: ld22a,
    blocks: [
      "In 2022, I led the NTUEE Light Dance team, where we designed, fabricated, and programmed all the hardware and software components to bring to life this glow-in-the-dark performance.",
      [yt("rN6hMTVfCt4")],
      "The hardware team designed the circuit, assembled the components, oversaw system performance, and promptly addressed any necessary repairs. The software team developed a customized software, supporting wireless control of lighting effects, real-time display functions, as well as remote connections and synchronization during the performance. The prop team leveraged their expertise in 3D printing, laser cutting, and woodworking to craft staggering stage props. The costume team secured electronic modules, light sources, wires, and fibers integrated into fabrics, bringing the suits to life.",
      [img(ld22b), img(ld22c)],
      "This year, we renovated the performance by replacing EL wires with optical fibers to enable color-changing effects. Additionally, we put effort into hardware modularization, improved stability and established a foundation for future performances. On the software side, we added collaborative editing functions and a 3D editing interface to the lighting software for a better and more streamlined experience.",
      [img(ld22e), img(ld22g)],
      "The performance received wide acclaim from the audience and coverage from multiple news outlets such as [Taiwan Talent Show](https://www.youtube.com/watch?v=FhOetR7Xyeg), [SETN News](https://www.youtube.com/watch?v=qkcO6AAhVLg), [TVBS News](https://www.youtube.com/watch?v=DwLZsQupDiU), and [ETtoday](https://boba.ettoday.net/videonews/329860).",
      [img(ld22h), img(ld22f)],
      [img(ld22i)],
    ],
  },
  {
    slug: "ultrabat",
    title: "UltraBat",
    description: "An interactive 3D side-scrolling game using ultrasound levitation",
    cover: bat1,
    blocks: [
      "We presented our project, UltraBat, at the 2022 UIST SIC on Halloween. UltraBat is an interactive 3D arcade game that challenges players to guide a bat through a series of wooden blocks, avoiding obstacles to reach the destination. Using a joystick, players can adjust the heading direction to control the bat's jumping movement. The distance and height of each jump are determined by the duration of joystick input—how long it is held and when it is released. The game requires players to exhibit precise control to navigate through obstacles and prevent the bat from falling.",
      [yt("TdXyQqirVXk")],
      "Our device is constructed of 3 parts: the bottom terrain, the middle levitation space, and the obstacles on top. Acting as the system's brain, the computer directly manipulates ultrasound wave patterns to control the movement of the bat. This process involves mapping the jumping trajectory to the levitation software, allowing for the adjustment of initial velocity and gravitational force (g force) to modify the path. In addition to controlling the character's movement, the computer also manages the movement of the levers, which involves sending signals via UART to a Mega 2560 controller board. This board then transmits the signals to the PCB, which contains drivers that pass the signals to the stepper motors. The motors are connected to a cam structure that converts rotary motion to linear motion, thereby creating a lever system that shifts up and down.",
      [img(bat2), img(bat3)],
      [img(bat4), img(bat5), img(bat6)],
    ],
  },
  {
    slug: "echo",
    title: "Echo",
    description: "Explore a world of darkness through soundwaves",
    cover: echoThumb,
    blocks: [
      [yt("9-lRQwHyP_0")],
      "This Unity game is a group project for the Game Design course. We drew inspiration from the horror game Dark Echo, where players navigate dangerous environments using visualized sound bouncing off obstacles to reveal the shape of the surrounding world.",
      [img(darkEcho, "Inspired by Dark Echo"), img(echoCaveWave, "Our interpretation of 3D soundwaves")],
      "In our game, we elevated this concept by making the environment and soundwaves 3-dimensional. With each step, players observe soundwaves emanating from their footprints, creating a dynamic visual representation of the 3D world. These waves extend throughout the environment, guiding players as they explore their path. The objective is to collect all four gemstones and place them on the central altar.",
      [img(echoFirefly), img(echoRed), img(evil)],
    ],
  },
  {
    slug: "4dof-gantry",
    title: "4DoF Gantry Machine",
    description: "A gantry machine with 4DoF motion",
    cover: dof1,
    blocks: [
      "One of my research projects delves into human perception, particularly focusing on the palm's capacity to perceive airflow directionality. To conduct a thorough user study and ensure robust results, I developed specialized equipment capable of 4DoF motion. This includes translational movement along both the x and y axes, as well as yaw and pitch rotation. To build this apparatus, I repurposed a 3D printer kit, adding two servo motors and two laser modules to pinpoint the focal point location on the palm.",
      [img(dof1), img(dof2)],
    ],
  },
  {
    slug: "3d-display",
    title: "3D Display",
    description: "An interactive 3D display",
    cover: hologram3,
    blocks: [
      "In this project, our team aimed to create a floating 3D display using minimal equipment. Inspired by [Pepper's Cone](https://doi.org/10.1145/3126594.3126602), which leverages the Pepper's Ghost illusion, we extended its capabilities to develop an interactive device. Viewers can interact with the technology through a joystick to adjust the image angle and a button to switch between pictures. Additionally, we deployed the software as a web page for cross-platform accessibility.",
      [
        img(hologram2, "Experimenting with Pepper's Ghost illusion"),
        img(hologram3, "The 3D interactive display"),
      ],
    ],
  },
  {
    slug: "gesture-car",
    title: "Gesture-control Car",
    description: "A smart wheelchair simulated by a gesture-control car",
    cover: car,
    blocks: [
      "In the final project of the EECS Cornerstone course, we transformed a remote control car into a smart wheelchair with the aim of aiding individuals with mobility impairments, offering them enhanced control and independence. To achieve this, we implemented gesture control by designing a glove equipped with a three-axis accelerometer and a Lilypad, allowing users to control the wheelchair's direction through hand gestures. An ultrasonic module at the front of the vehicle automatically detects obstacles for hazard avoidance. The integration of a WiFi module facilitates the transmission of sensed information to a cloud platform, connected to communication software that enables caregivers to monitor the user's location. Our project earned us first place in the final competition.",
      [yt("-XoNP0iro9I")],
    ],
  },
  {
    slug: "light-dance-2021",
    title: "Light Dance 2021",
    description: "Creating the light sword",
    cover: ld21a,
    blocks: [
      "The “Light Dance” show is an event put together by students at NTUEE, showcasing a combination of technology and dance. The performance is well-known for its mesmerizing lighting effects as well as the custom-made hardware and software. Held annually at Yi-Ren Hall during the Night of Electrical Engineering, the performance extends its appeal beyond the campus borders. Noteworthy appearances include the NTU Arts Festival and the 2020 VLSI Design/CAD Symposium.",
      [img(ld21a, "2021 Light Dance performance at NTU Yi-Ren Hall")],
      "My contributions in 2021 included designing the light sword and repairing and maintaining the hardware packages for dancers. The product design experience of the light sword allowed me to acquire hands-on experience with 3D printing and laser-cutting technologies as well as utilizing LED strips and other materials to produce desired lighting effects. Moreover, through fixing and upkeeping the hardware components, I enhanced my comprehension of how electrical engineering knowledge can be implemented in practical applications.",
      [img(ld21b), img(ld21c)],
      [yt("e2-6fEDV36U")],
    ],
  },
  {
    slug: "makerspace",
    title: "Makerspace",
    description: "Reconstruct a workspace for makers and creative minds",
    cover: maker1,
    blocks: [
      "In July 2021, I co-directed the Academic Branch of the NTUEE Student Association. One of our main responsibilities is to run the Makerspace that provide students access to tools and equipment for creative projects and hands-on making experiences. This year, we relocated the old Makerspace to the new department building, reconstructed the space, and upgraded our equipment to support a broader range of projects.",
      [img(maker1), img(maker2)],
      "The Makerspace serves as an innovative hub for students to explore and experiment with technology, design, and creativity. We organized workshops covering topics such as 3D printing, laser cutting, and SBCs, and arranged talks featuring alumni and industry professionals.",
      [img(maker3), img(maker4)],
    ],
  },
];

/**
 * Where one piece of a project's spread sits, in units of 1/48 of the
 * window's width, across and down alike — so the page is one drawing at any
 * width. `key` names the piece: "title", "dek", "cover", "p0"… for the
 * paragraphs and "m0"… for the other pictures and videos, in the order the
 * blocks list them. A picture's `crop` is the point of it kept in view and
 * how far it is zoomed; a text's `size` scales its type, and `cols` sets it
 * in that many columns.
 */
export type LayoutItem = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  crop?: { x: number; y: number; zoom: number };
  size?: number;
  cols?: number;
};

/** A spread arranged by hand, and how many units tall the window it was
 *  arranged in was — it is stretched to fit any other. */
export type SavedLayout = { rows: number; items: LayoutItem[] };

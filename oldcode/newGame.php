<?php require_once('ledatabanko.php'); ?>

<?php

$total_rows = 1;
$roomCode = '';

// while the room code we found already exists ...
while($total_rows > 0) {
	// determine a new room code
	$characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	$charactersLength = count($characters);
	$idLength = 4;
	for ($i = 0; $i < $idLength; $i++) {
	  $roomCode .= $characters[rand(0, strlen($characters)-1)];
	}

	// check if it exists
	$checkQuery = $conn->query("SELECT COUNT(*) FROM `games` WHERE `room` = '$roomCode' ");
	$total_rows = mysqli_fetch_array($checkQuery)[0];
	echo $conn->error;
}

// if not, create new entry in database
$conn->query("INSERT INTO `games` (room) VALUES ('$roomCode')");
echo $conn->error;

// now return to the lobby
$url = 'lobby.php?type=newPage&room=' . $roomCode . '#init'; 
header( "Location: $url" );

?>
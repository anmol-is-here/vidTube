import { asyncHandler } from "../utils/asyncHandler.js"
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js"
import { apiResponse } from "../utils/apiResponse.js"

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        if(!user) {
            throw new apiError(404, "User not found")
        }
        
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
    
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})
        return {accessToken, refreshToken}
    } catch (error) {
        throw new apiError(500, "Something went wrong while generating access and refresh tokens")
    }
}

const registerUser = asyncHandler( async(req, res) => {
    const {fullname, email, username, password} = req.body

    // validation 
    if(
        [fullname, email, username, password].some((field) =>
        field?.trim() === "")
    ){
        throw new apiError(400, "All fields are required.")
    }

    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })
    if(existedUser) {
        throw new apiError(409, "User with given username or email already exist.")
    }

    const avatarLocalPath = req.files?.avatar?.[0]?.path
    console.log(req.files)
    const coverLocalPath = req.files?.coverImage?.[0]?.path
    console.log(coverLocalPath)
    
    if(!avatarLocalPath){
        throw new apiError(400, "Avatar file is missing")
    }
    // const avatar = await uploadOnCloudinary(avatarLocalPath)
    // let coverImage = ""
    // if(coverLocalPath){
    //     coverImage = await uploadOnCloudinary(coverLocalPath)
    // }

    let avatar;
    try {
        avatar = await uploadOnCloudinary(avatarLocalPath)
        // console.log(avatar)
        console.log(`uploaded avatar ${avatar}`)
    } catch (error) {
        console.log(`Error uploading avatar ${error}`);
        throw new apiError(500, "Failed to upload avatar")
    }

    let coverImage;
    try {
        coverImage = await uploadOnCloudinary(coverLocalPath)
        console.log(`uploaded coverImage ${coverImage}`)
    } catch (error) {
        console.log(`Error uploading coverImage ${error}`);
        throw new apiError(500, "Failed to upload coverImage")
    }

    try {
        const user = await User.create({
            fullname,
            avatar: avatar.url,
            coverImage: coverImage?.url || "",
            email,
            password,
            username: username.toLowerCase()
        })
    
        const createdUser = await User.findById(user._id).select(
            "-password, -refreshToken"
        )
        console.log(createdUser)
        if(!createdUser){
            throw new apiError(500, "something went wrong while registering user")
        }
    
        return res.status(201).json(
            new apiResponse(200, createdUser, "user registered successfully")
        )
    } catch (error) {
        console.log(`User creation falied`);

        // console.log(avatar)
        if(avatar){
            await deleteFromCloudinary(avatar.public_id)
        }
        if(coverImage){
            await deleteFromCloudinary(coverImage.public_id)
        }
        throw new apiError(500, "something went wrong while registering user and images were deleted")
    }
})

const loginUser = asyncHandler( async (req, res) => {
    // get data from body
    const {email, username, password} = req.body
    // validation
    if(!email){
        throw new apiError(400, "Email is required")
    }
    const user = await User.findOne({
        $or: [{username}, {email}]
    })
    if(!user){
        throw new apiError(404, "User not found")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new apiError(401, "Invalid Credentials")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)
    const loggedInUser = await User.findById(user._id)
        .select("-password refreshToken")
    
    if(!loggedInUser){
        throw new apiError(404, "user details not found.")
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json( new apiResponse(
            200,
            { user: loggedInUser, accessToken, refreshToken},
            "User logged in successfully"
        ))

})

const changeCurrentPassword = asyncHandler( async (req, res) => {
    const {oldPassword, newPassword} = req.body
    const user = await User.findById(req.user?._id)
    const isPasswordValid = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordValid){
        throw new apiError(401, "invalid old password")
    }

    user.password = newPassword
    await user.save( {validateBeforeSave: true})

    return res
        .status(200)
        .json( new apiResponse(200, {}, "password updated successfully"))
})

const getCurrentUser = asyncHandler( async (req, res) => {
    return res
        .status(200)
        .json( new apiResponse(200, req.user, "current user details"))
})

const updateAccountDetails = asyncHandler( async (req, res) => {
    const {fullname, email} = req.body
    if(!fullname || !email){
        throw new apiError(400, "fullname and email are required")
    }
    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                fullname,
                email: email
            }
        },
        {new: true}
    ).select("-password -refreshToken")

    return res
        .status(200)
        .json( new apiResponse(200, user, "Account details updated successfully"))
})

const updateUserAvatar = asyncHandler( async (req, res) => {
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath){
        throw new apiError(400, "file is required")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url){
        throw new apiError(400, "no url is found")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password -refreshToken")

    return res
        .status(200)
        .json(new apiResponse(200, user, "Avatar updated successfully"))
})

const updateUserCoverImage = asyncHandler( async (req, res) => {
    const coverLocalPath = req.file?.path
    if(!coverLocalPath){
        throw new apiError(401, "file is required")
    }
    const coverImage = await uploadOnCloudinary(coverLocalPath)
    if(!coverImage.url){
        throw new apiError(400, "no url is found")
    }
    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password refreshToken")

    return res
        .status(200)
        .json(new apiResponse(200, user, "CoverImage updated successfully"))
})

export { 
    registerUser, 
    loginUser,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
}